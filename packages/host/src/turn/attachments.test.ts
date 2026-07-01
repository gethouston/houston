import { expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { MemoryVfs } from "../vfs";
import {
  AttachmentError,
  deleteAttachments,
  handleAttachments,
  saveAttachments,
} from "./attachments";
import { listWorkspace } from "./files";

/**
 * Composer attachments over an agent's workspace root. The files land under a
 * top-level `.attachments/<scopeId>/` dot-dir so the runtime's clamped file
 * tools (rooted at the same dir) can Read them at the RELATIVE path returned,
 * while the Files tab — which hides + refuses top-level dot-dirs — never shows
 * or touches them. Path safety stops a hostile scopeId/filename escaping.
 */

const ROOT = "ws/w1/agent-1/workspace"; // cloud agentRoot
const PATHS = { agentRoot: () => ROOT } as unknown as WorkspacePaths;
const CTX = { workspace: {} as Workspace, agent: {} as Agent };

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

test("save returns relative workspace paths; bytes land where the agent reads them", async () => {
  const vfs = new MemoryVfs();
  const paths = await saveAttachments(vfs, ROOT, "activity-7", [
    { name: "brief.txt", contentBase64: b64("hello brief") },
    { name: "data.csv", contentBase64: b64("a,b\n1,2") },
  ]);

  // The returned paths are relative to the workspace root (what the agent's
  // Read tool resolves), keyed by scopeId.
  expect(paths).toEqual([
    ".attachments/activity-7/brief.txt",
    ".attachments/activity-7/data.csv",
  ]);
  // The bytes are at `<root>/<relPath>` — i.e. resolvable under the clamp root.
  expect(await vfs.readText(`${ROOT}/${paths[0]}`)).toBe("hello brief");
  expect(await vfs.readText(`${ROOT}/${paths[1]}`)).toBe("a,b\n1,2");
});

test("binary round-trips byte-for-byte through base64", async () => {
  const vfs = new MemoryVfs();
  const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  const [rel] = await saveAttachments(vfs, ROOT, "s1", [
    { name: "deck.pptx", contentBase64: payload.toString("base64") },
  ]);
  const stored = await vfs.readBytes(`${ROOT}/${rel}`);
  if (stored === null)
    throw new Error("expected bytes to be stored but got null");
  expect(Buffer.compare(stored, payload)).toBe(0);
});

test("duplicate filenames in one batch are disambiguated, never overwritten", async () => {
  const vfs = new MemoryVfs();
  const paths = await saveAttachments(vfs, ROOT, "s1", [
    { name: "report.pdf", contentBase64: b64("first") },
    { name: "report.pdf", contentBase64: b64("second") },
  ]);
  expect(paths).toEqual([
    ".attachments/s1/report.pdf",
    ".attachments/s1/report (1).pdf",
  ]);
  expect(await vfs.readText(`${ROOT}/${paths[0]}`)).toBe("first");
  expect(await vfs.readText(`${ROOT}/${paths[1]}`)).toBe("second");
});

test("attachments are invisible to the Files tab (top-level dot-dir)", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/report.txt`, "visible");
  await saveAttachments(vfs, ROOT, "s1", [
    { name: "secret.txt", contentBase64: b64("x") },
  ]);
  const listed = (await listWorkspace(vfs, ROOT)).map((f) => f.path);
  expect(listed).toContain("report.txt");
  expect(listed.some((p) => p.startsWith(".attachments"))).toBe(false);
});

test("delete drops the whole scope's batch", async () => {
  const vfs = new MemoryVfs();
  await saveAttachments(vfs, ROOT, "s1", [
    { name: "a.txt", contentBase64: b64("a") },
    { name: "b.txt", contentBase64: b64("b") },
  ]);
  await saveAttachments(vfs, ROOT, "s2", [
    { name: "c.txt", contentBase64: b64("c") },
  ]);

  await deleteAttachments(vfs, ROOT, "s1");
  expect(await vfs.list(`${ROOT}/.attachments/s1`)).toEqual([]);
  // A different scope is untouched.
  expect(await vfs.readText(`${ROOT}/.attachments/s2/c.txt`)).toBe("c");
});

test("traversal in scopeId or filename is rejected, never silently clamped", async () => {
  const vfs = new MemoryVfs();
  await expect(
    saveAttachments(vfs, ROOT, "../escape", [
      { name: "a.txt", contentBase64: b64("a") },
    ]),
  ).rejects.toThrow(AttachmentError);
  await expect(
    saveAttachments(vfs, ROOT, "s1", [
      { name: "../../auth.json", contentBase64: b64("x") },
    ]),
  ).rejects.toThrow(AttachmentError);
  await expect(
    saveAttachments(vfs, ROOT, "s1", [
      { name: "sub/evil.txt", contentBase64: b64("x") },
    ]),
  ).rejects.toThrow(AttachmentError);
  await expect(deleteAttachments(vfs, ROOT, "..")).rejects.toThrow(
    AttachmentError,
  );
});

// --- HTTP handler ---

function fakeRes() {
  const state = { status: 0, body: null as unknown };
  const res = {
    writeHead(code: number) {
      state.status = code;
      return this;
    },
    end(buf?: Buffer | string) {
      if (buf !== undefined)
        state.body = JSON.parse(
          Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf),
        );
    },
  };
  return { res: res as never, state };
}

/** A fake IncomingMessage that yields a JSON body once (async-iterable). */
function fakeReq(body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  return {
    async *[Symbol.asyncIterator]() {
      yield buf;
    },
  } as never;
}

test("POST uploads then DELETE clears, over the HTTP handler", async () => {
  const vfs = new MemoryVfs();

  const post = fakeRes();
  const handledPost = await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "POST",
    "attachments",
    fakeReq({
      scopeId: "activity-1",
      files: [{ name: "n.txt", contentBase64: b64("body") }],
    }),
    post.res,
    new URLSearchParams(),
  );
  expect(handledPost).toBe(true);
  expect(post.state.status).toBe(200);
  expect((post.state.body as { paths: string[] }).paths).toEqual([
    ".attachments/activity-1/n.txt",
  ]);
  expect(await vfs.readText(`${ROOT}/.attachments/activity-1/n.txt`)).toBe(
    "body",
  );

  const del = fakeRes();
  await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "DELETE",
    "attachments",
    fakeReq({}),
    del.res,
    new URLSearchParams({ scopeId: "activity-1" }),
  );
  expect(del.state.status).toBe(200);
  expect(await vfs.list(`${ROOT}/.attachments/activity-1`)).toEqual([]);
});

test("malformed upload bodies fail loudly (400), DELETE without scopeId 400s", async () => {
  const vfs = new MemoryVfs();

  const noScope = fakeRes();
  await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "POST",
    "attachments",
    fakeReq({ files: [] }),
    noScope.res,
    new URLSearchParams(),
  );
  expect(noScope.state.status).toBe(400);

  const badFile = fakeRes();
  await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "POST",
    "attachments",
    fakeReq({ scopeId: "s1", files: [{ name: "n.txt" }] }),
    badFile.res,
    new URLSearchParams(),
  );
  expect(badFile.state.status).toBe(400);

  const delNoScope = fakeRes();
  await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "DELETE",
    "attachments",
    fakeReq({}),
    delNoScope.res,
    new URLSearchParams(),
  );
  expect(delNoScope.state.status).toBe(400);
});

test("a missing vfs answers 503 for attachments routes", async () => {
  const { res, state } = fakeRes();
  const handled = await handleAttachments(
    undefined,
    PATHS,
    CTX,
    "POST",
    "attachments",
    fakeReq({ scopeId: "s1", files: [] }),
    res,
    new URLSearchParams(),
  );
  expect(handled).toBe(true);
  expect(state.status).toBe(503);
});

test("non-attachments rest is not handled (returns false)", async () => {
  const { res } = fakeRes();
  const handled = await handleAttachments(
    new MemoryVfs(),
    PATHS,
    CTX,
    "GET",
    "files",
    fakeReq({}),
    res,
    new URLSearchParams(),
  );
  expect(handled).toBe(false);
});
