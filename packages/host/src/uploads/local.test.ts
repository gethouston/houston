import { once } from "node:events";
import { watch } from "node:fs";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chunkContentRange,
  parseUploadSession,
  statusQueryContentRange,
  type UploadSession,
} from "@houston/wire-types";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";
import { LocalUploadSessions } from "./local";
import { serveUploadSink } from "./sink";
import { UPLOAD_TTL_MS } from "./types";

let directory: string;
let sessions: LocalUploadSessions;
let base: string;
let host: Awaited<ReturnType<typeof replayHost>>;
let server: ReturnType<typeof createControlPlaneServer>;
const granule = 256 * 1024;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "h1-upload-"));
  sessions = new LocalUploadSessions(join(directory, "upload-staging"));
  host = await replayHost();
  host.deps.uploadSessions = sessions;
  server = createControlPlaneServer(host.deps);
  base = await listen(server);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await close(server);
  await rm(directory, { recursive: true, force: true });
});
async function open(
  size: number,
  purpose = "attachment",
  name = "file.txt",
): Promise<UploadSession> {
  const response = await fetch(`${base}/agents/${host.ids.agentId}/uploads`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, size, purpose }),
  });
  expect(response.status).toBe(200);
  const parsed = parseUploadSession(await response.json());
  expect(parsed).not.toBeNull();
  if (!parsed) throw new Error("session malformed");
  return parsed;
}
const put = (
  session: UploadSession,
  range: string,
  body?: Uint8Array,
  no308 = false,
) =>
  fetch(`${base}${session.uploadUrl}`, {
    method: "PUT",
    headers: {
      "Content-Range": range,
      ...(no308 ? { "X-GUploader-No-308": "yes" } : {}),
    },
    body: body ? new Uint8Array(body) : undefined,
    redirect: "manual",
  });

test("open validates size, shape and agent ownership; caps sessions per person", async () => {
  const call = (body: unknown, token = "alice") =>
    fetch(`${base}/agents/${host.ids.agentId}/uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer tok:${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  expect(
    (await call({ name: "x", size: 1, purpose: "attachment" }, "bob")).status,
  ).toBe(403);
  expect((await call({ size: 1 })).status).toBe(400);
  expect((await call(null)).status).toBe(400);
  const malformed = await fetch(`${base}/agents/${host.ids.agentId}/uploads`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  expect(malformed.status).toBe(400);
  const oversized = await call({
    name: "x",
    size: 101 * 1024 * 1024,
    purpose: "attachment",
  });
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toMatchObject({ code: "upload_too_large" });
  const before = Date.now();
  const session = await open(1);
  expect(session.chunkBytes).toBe(8 * 1024 * 1024);
  expect(Date.parse(session.expiresAt)).toBeGreaterThanOrEqual(
    before + UPLOAD_TTL_MS,
  );
  const meta = JSON.parse(
    await readFile(sessions.path(session.uploadId, "json"), "utf8"),
  );
  expect(meta).toMatchObject({
    agentId: host.ids.agentId,
    workspace: host.ids.workspaceId,
    owner: "alice",
    purpose: "attachment",
    name: "file.txt",
    size: 1,
  });
  for (let n = 1; n < 16; n++) await open(1);
  const limited = await call({ name: "x", size: 1, purpose: "attachment" });
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBeTruthy();
  expect(await limited.json()).toMatchObject({ code: "too_many_uploads" });
});

test("three chunks, queries, exact offsets, No-308, bounds and atomic completion", async () => {
  const total = 2 * granule + 7;
  const session = await open(total);
  let response = await put(session, statusQueryContentRange(total));
  expect(response.status).toBe(308);
  expect(response.headers.get("range")).toBeNull();
  response = await put(
    session,
    chunkContentRange(0, granule, total),
    new Uint8Array(granule).fill(1),
  );
  expect(response.status).toBe(308);
  expect(response.headers.get("range")).toBe(`bytes=0-${granule - 1}`);
  response = await put(
    session,
    chunkContentRange(0, granule, total),
    new Uint8Array(granule).fill(9),
  );
  expect(response.status).toBe(308);
  expect(response.headers.get("range")).toBe(`bytes=0-${granule - 1}`);
  expect((await stat(sessions.path(session.uploadId, "part"))).size).toBe(
    granule,
  );
  response = await put(
    session,
    chunkContentRange(granule, 2 * granule, total),
    new Uint8Array(granule).fill(2),
    true,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("x-http-status-code-override")).toBe("308");
  response = await put(
    session,
    `bytes ${2 * granule}-${total}/${total}`,
    new Uint8Array(8),
  );
  expect(response.status).toBe(400);
  response = await put(
    session,
    statusQueryContentRange(total),
    undefined,
    true,
  );
  expect(response.headers.get("range")).toBe(`bytes=0-${2 * granule - 1}`);
  response = await put(
    session,
    chunkContentRange(2 * granule, total, total),
    new Uint8Array(7).fill(3),
    true,
  );
  expect(await response.json()).toEqual({
    uploadId: session.uploadId,
    size: total,
  });
  expect(response.headers.get("x-http-status-code-override")).toBeNull();
  const bytes = await readFile(sessions.path(session.uploadId, "done"));
  expect(bytes.subarray(0, granule).every((n) => n === 1)).toBe(true);
  expect(bytes.subarray(granule, 2 * granule).every((n) => n === 2)).toBe(true);
  expect(
    (await readdir(sessions.directory)).some((name) => name.endsWith(".part")),
  ).toBe(false);
  expect((await put(session, statusQueryContentRange(total))).status).toBe(200);
  expect(
    (await fetch(`${base}/v1/uploads/unknown`, { method: "PUT" })).status,
  ).toBe(404);
});

test("preflight permits storage headers and exposes the resumable response headers", async () => {
  const response = await fetch(`${base}/v1/uploads/unknown`, {
    method: "OPTIONS",
    headers: { Origin: "tauri://localhost" },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-headers")).toContain(
    "Content-Range",
  );
  expect(response.headers.get("access-control-allow-headers")).toContain(
    "X-GUploader-No-308",
  );
  expect(response.headers.get("access-control-expose-headers")).toContain(
    "Range",
  );
  expect(response.headers.get("access-control-expose-headers")).toContain(
    "X-HTTP-Status-Code-Override",
  );
});

test("expired sessions return 404 and boot/open sweeps remove all staging files", async () => {
  let now = Date.now();
  sessions = new LocalUploadSessions(join(directory, "expiry"), () => now);
  const session = await sessions.open(
    { name: "x", size: 1, purpose: "attachment" },
    { agentId: "a", workspace: "w", owner: "p" },
  );
  await close(server);
  host.deps.uploadSessions = sessions;
  server = createControlPlaneServer(host.deps);
  base = await listen(server);
  now += UPLOAD_TTL_MS;
  expect((await put(session, "bytes */1")).status).toBe(404);
  expect(await sessions.meta(session.uploadId)).toBeNull();
  const old = new Date(Date.now() - UPLOAD_TTL_MS - 1000);
  await Promise.all(
    ["part", "json"].map((suffix) =>
      utimes(
        join(sessions.directory, `${session.uploadId}.${suffix}`),
        old,
        old,
      ),
    ),
  );
  await sessions.sweep();
  expect(await readdir(sessions.directory)).toEqual([]);
  await sessions.open(
    { name: "x", size: 1, purpose: "attachment" },
    { agentId: "a", workspace: "w", owner: "p" },
  );
});

test("an aborted chunk reports persisted bytes and resumes at that offset", async () => {
  const session = await open(granule * 2);
  const settled = Promise.withResolvers<void>();
  const sink = createServer((req, res) => {
    // A dropped connection is an expected state, never a handler failure.
    serveUploadSink(sessions, session.uploadId, req, res).then(
      () => settled.resolve(),
      (error) => settled.reject(error),
    );
  });
  const url = await listen(sink);
  try {
    const persisted = Promise.withResolvers<void>();
    const watcher = watch(sessions.path(session.uploadId, "part"), async () => {
      try {
        if (
          (await stat(sessions.path(session.uploadId, "part"))).size === granule
        )
          persisted.resolve();
      } catch (error) {
        persisted.reject(error);
      }
    });
    const client = request(url, {
      method: "PUT",
      headers: {
        "Content-Range": chunkContentRange(0, 2 * granule, 2 * granule),
        "Content-Length": 2 * granule,
      },
    });
    const closed = new Promise<void>((resolve) =>
      client.once("close", resolve),
    );
    const clientErrors: Error[] = [];
    client.on("error", (error) => clientErrors.push(error));
    client.write(Buffer.alloc(granule, 4));
    await persisted.promise;
    watcher.close();
    client.destroy();
    await closed;
    expect(clientErrors.map((error) => error.message)).toEqual([
      "socket hang up",
    ]);
    await settled.promise;
    const query = await put(session, statusQueryContentRange(2 * granule));
    expect(query.headers.get("range")).toBe(`bytes=0-${granule - 1}`);
    const complete = await put(
      session,
      chunkContentRange(granule, 2 * granule, 2 * granule),
      new Uint8Array(granule).fill(5),
    );
    expect(complete.status).toBe(200);
    expect(
      (await readFile(sessions.path(session.uploadId, "done"))).length,
    ).toBe(granule * 2);
  } finally {
    await close(sink);
  }
});

test("a 24 MiB request streams without building a whole-file Buffer", async () => {
  const total = 24 * 1024 * 1024;
  const session = await open(total);
  const concat = Buffer.concat;
  let maxConcat = 0;
  vi.spyOn(Buffer, "concat").mockImplementation((list, length) => {
    maxConcat = Math.max(
      maxConcat,
      length ?? list.reduce((n, b) => n + b.byteLength, 0),
    );
    return concat(list, length);
  });
  const response = await new Promise<number>((resolve, reject) => {
    const client = request(
      `${base}${session.uploadUrl}`,
      {
        method: "PUT",
        headers: {
          "Content-Range": chunkContentRange(0, total, total),
          "Content-Length": total,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    client.on("error", reject);
    void (async () => {
      for (let n = 0; n < total / granule; n++)
        if (!client.write(Buffer.alloc(granule, 1)))
          await once(client, "drain");
      client.end();
    })().catch(reject);
  });
  expect(response).toBe(200);
  expect((await stat(sessions.path(session.uploadId, "done"))).size).toBe(
    total,
  );
  expect(maxConcat).toBeLessThan(1024 * 1024);
});

test("a status query finalizes a complete part left before its atomic rename", async () => {
  const session = await open(3);
  await writeFile(sessions.path(session.uploadId, "part"), "abc");
  const response = await put(session, "bytes */3", undefined, true);
  expect(response.status).toBe(200);
  expect(response.headers.get("x-http-status-code-override")).toBeNull();
  expect(await response.json()).toEqual({
    uploadId: session.uploadId,
    size: 3,
  });
  expect(await readFile(sessions.path(session.uploadId, "done"), "utf8")).toBe(
    "abc",
  );
});

test("a body longer than its Content-Range keeps none of its bytes", async () => {
  const session = await open(granule * 2);
  const response = await put(
    session,
    chunkContentRange(0, granule, granule * 2),
    new Uint8Array(granule + 10).fill(7),
  );
  expect(response.status).toBe(400);
  expect((await stat(sessions.path(session.uploadId, "part"))).size).toBe(0);
  const query = await put(session, statusQueryContentRange(granule * 2));
  expect(query.headers.get("range")).toBeNull();
});
