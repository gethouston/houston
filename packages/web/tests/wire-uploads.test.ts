import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installLocalStorage, ORG } from "./support/wire-capture";

const BASE = "https://host.example";
const CHUNK = 8 * 1024 * 1024;
const SESSION = {
  uploadId: "upload_session_0001",
  uploadUrl: "/v1/sink",
  chunkBytes: CHUNK,
  expiresAt: "2026-11-14T00:00:00Z",
};
const RESULT = { written: 1, skipped: 0, rejected: [], sessionsRebuilt: false };
interface RequestRecord {
  url: string;
  init: RequestInit;
  bytes: Uint8Array;
  headers: Headers;
}
let calls: RequestRecord[];
let respond: (call: RequestRecord) => Response;

beforeEach(() => {
  installLocalStorage();
  calls = [];
  respond = (call) =>
    call.url.endsWith("/uploads")
      ? Response.json(SESSION)
      : call.init.method === "PUT"
        ? new Response(null)
        : Response.json({ paths: ["uploads/file.bin"] });
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const request = init ?? {};
    const bytes = new Uint8Array(
      await new Response(request.body).arrayBuffer(),
    );
    const call = {
      url: String(url),
      init: request,
      bytes,
      headers: new Headers(request.headers),
    };
    calls.push(call);
    return respond(call);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function client() {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}
const text = (call: RequestRecord) => new TextDecoder().decode(call.bytes);
const large = () => new File([new Uint8Array(CHUNK + 3).fill(7)], "file.bin");
function assertOpen(
  call: RequestRecord,
  size: number,
  purpose: string,
  name = "file.bin",
) {
  expect(call.url).toBe(`${BASE}/agents/a%201/uploads`);
  expect(call.init.method).toBe("POST");
  expect(text(call)).toBe(JSON.stringify({ name, size, purpose }));
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
}
function assertPut(call: RequestRecord, range: string, bytes: Uint8Array) {
  expect(call.url).toBe(`${BASE}/v1/sink`);
  expect(call.init.method).toBe("PUT");
  expect(call.init.credentials).toBe("omit");
  expect(Object.fromEntries(call.headers)).toEqual({
    "content-type": "application/octet-stream",
    "content-range": range,
    "x-guploader-no-308": "yes",
  });
  expect(Buffer.compare(call.bytes, bytes)).toBe(0);
}

test("large attachments open, send exact chunks without credentials, then commit the upload ID", async () => {
  const file = large();
  respond = (call) =>
    call.url.endsWith("/uploads")
      ? Response.json(SESSION)
      : call.init.method === "PUT" &&
          call.headers.get("Content-Range") ===
            `bytes 0-${CHUNK - 1}/${file.size}`
        ? new Response(null, {
            headers: {
              "X-HTTP-Status-Code-Override": "308",
              Range: `bytes=0-${CHUNK - 1}`,
            },
          })
        : call.init.method === "PUT"
          ? new Response(null, { status: 201 })
          : Response.json({ paths: ["uploads/file.bin"] });
  const progress: string[] = [];
  await expect(
    client().saveAttachments("a 1", "conv", [file], {
      onProgress: (f, p) => {
        expect(f).toBe(file);
        progress.push(p.phase);
      },
    }),
  ).resolves.toEqual(["uploads/file.bin"]);
  expect(calls).toHaveLength(4);
  assertOpen(calls[0], file.size, "attachment");
  assertPut(
    calls[1],
    `bytes 0-${CHUNK - 1}/${file.size}`,
    new Uint8Array(CHUNK).fill(7),
  );
  assertPut(
    calls[2],
    `bytes ${CHUNK}-${file.size - 1}/${file.size}`,
    new Uint8Array(3).fill(7),
  );
  expect(calls[3].url).toBe(`${BASE}/agents/a%201/attachments`);
  expect(calls[3].init.method).toBe("POST");
  expect(text(calls[3])).toBe(
    JSON.stringify({
      scopeId: "conv",
      files: [{ name: file.name, uploadId: SESSION.uploadId }],
    }),
  );
  expect(calls[3].headers.get("Authorization")).toBe("Bearer t");
  expect(progress.slice(-2)).toEqual(["saving", "done"]);
});

test("an uncertain chunk sends an empty status query and resumes from storage's offset", async () => {
  vi.useFakeTimers();
  let backoffStarted = () => {};
  const scheduled = new Promise<void>((resolve) => {
    backoffStarted = resolve;
  });
  const schedule = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(
    (handler, ms, ...args) => {
      const timer = schedule(handler, ms, ...args);
      backoffStarted();
      return timer;
    },
  );
  let puts = 0;
  const c = client();
  respond = (call) => {
    if (call.url.endsWith("/uploads"))
      return Response.json({
        ...SESSION,
        uploadUrl: "https://storage.example/session",
      });
    if (call.init.method === "PUT") {
      puts++;
      if (puts === 1) return new Response(null, { status: 503 });
      if (puts === 2)
        return new Response(null, {
          status: 308,
          headers: { Range: "bytes=0-1" },
        });
      return new Response(null);
    }
    return Response.json(RESULT);
  };
  const pending = c.migrationImport("a 1", new Uint8Array([1, 2, 3]).buffer);
  await scheduled;
  await vi.runAllTimersAsync();
  await pending;
  assertOpen(calls[0], 3, "migration_import", "migration.zip");
  expect(calls[1].url).toBe("https://storage.example/session");
  expect(calls[2].url).toBe("https://storage.example/session");
  expect(calls[2].init.credentials).toBe("omit");
  expect(Object.fromEntries(calls[2].headers)).toEqual({
    "content-type": "application/octet-stream",
    "content-range": "bytes */3",
    "x-guploader-no-308": "yes",
  });
  expect(calls[2].bytes).toHaveLength(0);
  expect(calls[3].headers.get("Content-Range")).toBe("bytes 2-2/3");
  expect(calls[3].bytes).toEqual(new Uint8Array([3]));
});

test("Files imports preserve folder paths in their upload-ID commit", async () => {
  const file = large();
  Object.defineProperty(file, "webkitRelativePath", {
    value: "folder/file.bin",
  });
  let puts = 0;
  respond = (call) =>
    call.url.endsWith("/uploads")
      ? Response.json(SESSION)
      : call.init.method === "PUT" && ++puts === 1
        ? new Response(null, {
            headers: {
              "X-HTTP-Status-Code-Override": "308",
              Range: `bytes=0-${CHUNK - 1}`,
            },
          })
        : Response.json({});
  await client().uploadProjectFiles("a 1", [file], "docs");
  assertOpen(calls[0], file.size, "files_import");
  expect(calls[3].url).toBe(`${BASE}/agents/a%201/files/import`);
  expect(text(calls[3])).toBe(
    JSON.stringify({
      dir: "docs",
      files: [
        {
          name: "file.bin",
          relPath: "folder/file.bin",
          uploadId: SESSION.uploadId,
        },
      ],
    }),
  );
});

test("404 falls back to base64 once per SDK agent and reports small-file progress", async () => {
  const c = client();
  respond = (call) =>
    call.url.endsWith("/uploads")
      ? new Response(null, { status: 404 })
      : Response.json({ paths: ["uploads/file.bin"] });
  const file = large();
  for (let i = 0; i < 2; i++) await c.saveAttachments("a 1", "conv", [file]);
  expect(calls.filter((call) => call.url.endsWith("/uploads"))).toHaveLength(1);
  expect(calls).toHaveLength(3);
  expect(text(calls[1])).toBe(
    JSON.stringify({
      scopeId: "conv",
      files: [
        {
          name: file.name,
          contentBase64: Buffer.from(await file.arrayBuffer()).toString(
            "base64",
          ),
        },
      ],
    }),
  );
  const progress: Array<[number, string]> = [];
  const small = new File(["abc"], "small.txt");
  await c.saveAttachments("a 1", "conv", [small], {
    onProgress: (f, p) => {
      expect(f).toBe(small);
      progress.push([p.sentBytes, p.phase]);
    },
  });
  expect(progress).toEqual([
    [0, "uploading"],
    [3, "saving"],
    [3, "done"],
  ]);
});

test("migration chunks always use sessions, commit JSON, and expose per-chunk progress", async () => {
  respond = (call) =>
    call.url.endsWith("/uploads")
      ? Response.json(SESSION)
      : call.init.method === "PUT"
        ? new Response(null)
        : Response.json(RESULT);
  const progress: string[] = [];
  await expect(
    client().migrationImport("a 1", new Uint8Array([80, 75, 3]).buffer, {
      overwrite: true,
      sessions: false,
      onProgress: (p) => progress.push(p.phase),
    }),
  ).resolves.toEqual(RESULT);
  expect(calls).toHaveLength(3);
  assertOpen(calls[0], 3, "migration_import", "migration.zip");
  assertPut(calls[1], "bytes 0-2/3", new Uint8Array([80, 75, 3]));
  expect(calls[2].url).toBe(
    `${BASE}/agents/a%201/migration/import?overwrite=1&sessions=0`,
  );
  expect(calls[2].init.method).toBe("POST");
  expect(calls[2].headers.get("Content-Type")).toBe("application/json");
  expect(text(calls[2])).toBe(JSON.stringify({ uploadId: SESSION.uploadId }));
  expect(progress).toEqual(["uploading", "uploading", "saving", "done"]);
});

test("migration's raw zip fallback shares the SDK unavailable-session memory", async () => {
  respond = (call) =>
    call.url.endsWith("/uploads")
      ? new Response(null, { status: 404 })
      : Response.json(RESULT);
  const c = client();
  const bytes = new Uint8Array([80, 75, 3]);
  await c.migrationImport("a 1", bytes.buffer);
  await c.migrationImport("a 1", bytes.buffer);
  expect(calls).toHaveLength(3);
  for (const call of calls.slice(1)) {
    expect(call.url).toBe(`${BASE}/agents/a%201/migration/import`);
    expect(call.headers.get("Content-Type")).toBe("application/zip");
    expect(Buffer.compare(call.bytes, bytes)).toBe(0);
  }
});
