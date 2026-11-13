import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HoustonEvent } from "@houston/protocol";
import { zipSync } from "fflate";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";
import { LocalUploadSessions } from "./local";

let directory: string;
let host: Awaited<ReturnType<typeof replayHost>>;
let server: ReturnType<typeof createControlPlaneServer>;
let base: string;
let sessions: LocalUploadSessions;
let events: HoustonEvent[];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "h1-commit-"));
  sessions = new LocalUploadSessions(join(directory, "upload-staging"));
  host = await replayHost();
  host.deps.uploadSessions = sessions;
  events = [];
  host.deps.events = {
    emit: (_owner, event) => events.push(event),
    subscribe: () => () => {},
  };
  server = createControlPlaneServer(host.deps);
  base = await listen(server);
});
afterEach(async () => {
  await close(server);
  await rm(directory, { recursive: true, force: true });
});
const post = (route: string, body: unknown) =>
  fetch(`${base}/agents/${host.ids.agentId}/${route}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const root = () => `ws/${host.ids.workspaceId}/${host.ids.agentId}/workspace`;
async function stage(
  purpose: "attachment" | "files_import" | "migration_import",
  bytes: Uint8Array = Buffer.from("staged"),
  overrides: Partial<{
    agentId: string;
    owner: string;
    workspace: string;
  }> = {},
  complete = true,
) {
  const session = await sessions.open(
    { name: "source.txt", size: bytes.length, purpose },
    {
      agentId: host.ids.agentId ?? "",
      workspace: host.ids.workspaceId ?? "",
      owner: "alice",
      ...overrides,
    },
  );
  if (complete) {
    const response = await fetch(`${base}${session.uploadUrl}`, {
      method: "PUT",
      headers: {
        "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
      },
      body: new Uint8Array(bytes),
    });
    expect(response.status).toBe(200);
  }
  return session.uploadId;
}

test("staged attachments preserve dedup, mixed batches, FilesChanged and cleanup", async () => {
  await host.deps.vfs?.writeText(`${root()}/uploads/report.txt`, "earlier");
  const uploadId = await stage("attachment");
  const response = await post("attachments", {
    scopeId: "ignored",
    files: [
      { name: "report.txt", uploadId },
      {
        name: "inline.txt",
        contentBase64: Buffer.from("inline").toString("base64"),
      },
    ],
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    paths: ["uploads/report (1).txt", "uploads/inline.txt"],
  });
  expect(
    await host.deps.vfs?.readText(`${root()}/uploads/report (1).txt`),
  ).toBe("staged");
  expect(await host.deps.vfs?.readText(`${root()}/uploads/inline.txt`)).toBe(
    "inline",
  );
  expect(events).toEqual([
    { type: "FilesChanged", agentPath: host.ids.agentId },
  ]);
  expect(await readdir(sessions.directory)).toEqual([]);
});

test.each([
  ["purpose", { purpose: "files_import" as const }, 404, "upload_not_found"],
  ["agent", { agentId: "different" }, 404, "upload_not_found"],
  ["owner", { owner: "different" }, 404, "upload_not_found"],
  ["workspace", { workspace: "different" }, 404, "upload_not_found"],
  ["incomplete", {}, 409, "upload_incomplete"],
])("%s mismatch refuses the whole mixed batch before writing", async (kind, values, status, code) => {
  const uploadId = await stage(
    "purpose" in values ? values.purpose : "attachment",
    Buffer.from("staged"),
    "purpose" in values ? {} : values,
    kind !== "incomplete",
  );
  const response = await post("attachments", {
    files: [
      { name: "inline.txt", contentBase64: "aGk=" },
      { name: "file.txt", uploadId },
    ],
  });
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ code });
  expect(await host.deps.vfs?.list(root())).toEqual([]);
  expect(events).toEqual([]);
});

test("invalid paths and staged entries validate before destination writes", async () => {
  const uploadId = await stage("attachment");
  const response = await post("attachments", {
    files: [
      { name: "ok.txt", uploadId },
      { name: "../bad.txt", contentBase64: "aGk=" },
    ],
  });
  expect(response.status).toBe(400);
  expect(await host.deps.vfs?.list(root())).toEqual([]);
  expect(await sessions.meta(uploadId)).not.toBeNull();
  const malformed = await post("attachments", {
    files: [{ name: "x", uploadId: "bad" }],
  });
  expect(malformed.status).toBe(400);
});

test("files/import honors dir and relPath with staged and inline entries", async () => {
  const uploadId = await stage("files_import");
  const response = await post("files/import", {
    dir: "target",
    files: [
      { name: "file.txt", relPath: "folder/file.txt", uploadId },
      { name: "other.txt", contentBase64: "aGk=" },
    ],
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    paths: ["target/folder/file.txt", "target/other.txt"],
  });
  expect(
    await host.deps.vfs?.readText(`${root()}/target/folder/file.txt`),
  ).toBe("staged");
  expect(events).toEqual([
    { type: "FilesChanged", agentPath: host.ids.agentId },
  ]);
});

test("migration JSON body uses the unchanged zip importer and consumes staging", async () => {
  const bytes = zipSync({ "docs/note.txt": Buffer.from("migration") });
  const uploadId = await stage("migration_import", bytes);
  const response = await post("migration/import?overwrite=1&sessions=0", {
    uploadId,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    written: 1,
    skipped: 0,
    rejected: [],
    sessionsRebuilt: false,
  });
  expect(await host.deps.vfs?.readText(`${root()}/docs/note.txt`)).toBe(
    "migration",
  );
  expect(await readdir(sessions.directory)).toEqual([]);
  const raw = await fetch(
    `${base}/agents/${host.ids.agentId}/migration/import?sessions=0`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer tok:alice",
        "Content-Type": "application/zip",
      },
      body: new Uint8Array(bytes),
    },
  );
  expect(raw.status).toBe(200);
  expect(await raw.json()).toMatchObject({ written: 0, skipped: 1 });
});

test("stagedGeneration without a store client is a 400 on every commit family", async () => {
  const uploadId = await stage("attachment");
  for (const route of ["attachments", "files/import", "migration/import"]) {
    const entry = { name: "x", uploadId, stagedGeneration: "17" };
    const response = await post(
      route,
      route === "migration/import" ? entry : { files: [entry] },
    );
    expect(response.status).toBe(400);
  }
});
