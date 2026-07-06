import type { HoustonEvent } from "@houston/protocol";
import { expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { MemoryVfs } from "../vfs";
import {
  AttachmentError,
  handleAttachments,
  saveAttachments,
} from "./attachments";
import { listWorkspace } from "./files";

/**
 * Composer attachments over an agent's workspace root. Files land in a VISIBLE
 * top-level `uploads/` folder (HOU-706): the runtime's clamped file tools
 * (rooted at the same dir) Read them at the RELATIVE path returned, the Files
 * tab lists them, and nothing ever deletes them behind the user's back — an
 * upload from one conversation stays referenceable from every later one.
 * Path safety stops a hostile filename escaping the folder.
 */

const ROOT = "ws/w1/agent-1/workspace"; // cloud agentRoot
const PATHS = { agentRoot: () => ROOT } as unknown as WorkspacePaths;
const CTX = { workspace: {} as Workspace, agent: { id: "a-1" } as Agent };

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

test("save returns relative workspace paths; bytes land where the agent reads them", async () => {
  const vfs = new MemoryVfs();
  const paths = await saveAttachments(vfs, ROOT, [
    { name: "brief.txt", contentBase64: b64("hello brief") },
    { name: "data.csv", contentBase64: b64("a,b\n1,2") },
  ]);

  // The returned paths are relative to the workspace root (what the agent's
  // Read tool resolves).
  expect(paths).toEqual(["uploads/brief.txt", "uploads/data.csv"]);
  // The bytes are at `<root>/<relPath>` — i.e. resolvable under the clamp root.
  expect(await vfs.readText(`${ROOT}/${paths[0]}`)).toBe("hello brief");
  expect(await vfs.readText(`${ROOT}/${paths[1]}`)).toBe("a,b\n1,2");
});

test("binary round-trips byte-for-byte through base64", async () => {
  const vfs = new MemoryVfs();
  const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  const [rel] = await saveAttachments(vfs, ROOT, [
    { name: "deck.pptx", contentBase64: payload.toString("base64") },
  ]);
  const stored = await vfs.readBytes(`${ROOT}/${rel}`);
  if (stored === null)
    throw new Error("expected bytes to be stored but got null");
  expect(Buffer.compare(stored, payload)).toBe(0);
});

test("duplicate filenames in one batch are disambiguated, never overwritten", async () => {
  const vfs = new MemoryVfs();
  const paths = await saveAttachments(vfs, ROOT, [
    { name: "report.pdf", contentBase64: b64("first") },
    { name: "report.pdf", contentBase64: b64("second") },
  ]);
  expect(paths).toEqual(["uploads/report.pdf", "uploads/report (1).pdf"]);
  expect(await vfs.readText(`${ROOT}/${paths[0]}`)).toBe("first");
  expect(await vfs.readText(`${ROOT}/${paths[1]}`)).toBe("second");
});

test("uploads persist across saves: a later conversation's same-named file never clobbers an earlier one", async () => {
  const vfs = new MemoryVfs();
  const first = await saveAttachments(vfs, ROOT, [
    { name: "report.pdf", contentBase64: b64("from chat one") },
  ]);
  // A different conversation, days later, attaches a file with the same name.
  const second = await saveAttachments(vfs, ROOT, [
    { name: "report.pdf", contentBase64: b64("from chat two") },
  ]);
  expect(first).toEqual(["uploads/report.pdf"]);
  expect(second).toEqual(["uploads/report (1).pdf"]);
  expect(await vfs.readText(`${ROOT}/${first[0]}`)).toBe("from chat one");
  expect(await vfs.readText(`${ROOT}/${second[0]}`)).toBe("from chat two");
});

test("uploads are visible in the Files tab listing", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/report.txt`, "visible");
  await saveAttachments(vfs, ROOT, [
    { name: "attached.txt", contentBase64: b64("x") },
  ]);
  const listed = (await listWorkspace(vfs, ROOT)).map((f) => f.path);
  expect(listed).toContain("report.txt");
  expect(listed).toContain("uploads/attached.txt");
});

test("traversal or dotfile in filename is rejected, never silently clamped", async () => {
  const vfs = new MemoryVfs();
  await expect(
    saveAttachments(vfs, ROOT, [
      { name: "../../auth.json", contentBase64: b64("x") },
    ]),
  ).rejects.toThrow(AttachmentError);
  await expect(
    saveAttachments(vfs, ROOT, [
      { name: "sub/evil.txt", contentBase64: b64("x") },
    ]),
  ).rejects.toThrow(AttachmentError);
  await expect(
    saveAttachments(vfs, ROOT, [{ name: ".env", contentBase64: b64("x") }]),
  ).rejects.toThrow(AttachmentError);
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

test("POST uploads over the HTTP handler and fires FilesChanged", async () => {
  const vfs = new MemoryVfs();
  const events: HoustonEvent[] = [];

  const post = fakeRes();
  const handled = await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "POST",
    "attachments",
    // Legacy clients still send `scopeId` (older pods require it); it must be
    // accepted and ignored, not 400ed.
    fakeReq({
      scopeId: "activity-1",
      files: [{ name: "n.txt", contentBase64: b64("body") }],
    }),
    post.res,
    (e) => events.push(e),
  );
  expect(handled).toBe(true);
  expect(post.state.status).toBe(200);
  expect((post.state.body as { paths: string[] }).paths).toEqual([
    "uploads/n.txt",
  ]);
  expect(await vfs.readText(`${ROOT}/uploads/n.txt`)).toBe("body");
  // The upload landed in a visible folder → other Files tabs must refresh.
  expect(events).toEqual([{ type: "FilesChanged", agentPath: "a-1" }]);
});

test("the legacy DELETE (per-scope wipe) is refused — uploads are permanent", async () => {
  const vfs = new MemoryVfs();
  await saveAttachments(vfs, ROOT, [
    { name: "keep.txt", contentBase64: b64("keep") },
  ]);

  const del = fakeRes();
  const handled = await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "DELETE",
    "attachments",
    fakeReq({}),
    del.res,
  );
  expect(handled).toBe(true);
  expect(del.state.status).toBe(405);
  expect(await vfs.readText(`${ROOT}/uploads/keep.txt`)).toBe("keep");
});

test("malformed upload bodies fail loudly (400) and emit nothing", async () => {
  const vfs = new MemoryVfs();
  const events: HoustonEvent[] = [];

  const noFiles = fakeRes();
  await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "POST",
    "attachments",
    fakeReq({}),
    noFiles.res,
    (e) => events.push(e),
  );
  expect(noFiles.state.status).toBe(400);

  const badFile = fakeRes();
  await handleAttachments(
    vfs,
    PATHS,
    CTX,
    "POST",
    "attachments",
    fakeReq({ files: [{ name: "n.txt" }] }),
    badFile.res,
    (e) => events.push(e),
  );
  expect(badFile.state.status).toBe(400);
  expect(events).toEqual([]);
});

test("a missing vfs answers 503 for attachments routes", async () => {
  const { res, state } = fakeRes();
  const handled = await handleAttachments(
    undefined,
    PATHS,
    CTX,
    "POST",
    "attachments",
    fakeReq({ files: [] }),
    res,
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
  );
  expect(handled).toBe(false);
});
