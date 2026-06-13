import { test, expect } from "bun:test";
import { MemoryVfs } from "../vfs";
import {
  FilePathError,
  contentDisposition,
  createWorkspaceFolder,
  deleteWorkspaceFile,
  handleFileRequest,
  listWorkspace,
  mimeFor,
  readWorkspaceFile,
  renameWorkspaceFile,
} from "./files";
import type { TurnDeps } from "./deps";

/**
 * The cloud Files tab over a GCS workspace. The agent writes files to
 * <prefix>/workspace/ during a turn; these endpoints are what makes them show
 * up, be readable, renamable, and deletable. Path-safety is enforced so a
 * hostile rel-path can't escape the workspace.
 */

const PREFIX = "ws/w1/agent-1";

function deps(): { deps: TurnDeps; objects: MemoryVfs } {
  const objects = new MemoryVfs();
  return { deps: { vfs: objects } as unknown as TurnDeps, objects };
}

async function seed(objects: MemoryVfs, rel: string, content: string) {
  await objects.writeText(`${PREFIX}/workspace/${rel}`, content);
}

test("lists workspace files with synthesized folders, newest metadata", async () => {
  const { deps: d, objects } = deps();
  await seed(objects, "deck.pptx", "PPTX");
  await seed(objects, "data/sales.csv", "a,b\n1,2");
  await seed(objects, "data/notes.txt", "hi");

  const files = await listWorkspace(d, PREFIX);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
  // The folder is synthesized and sorts first.
  expect(byPath["data"]?.is_directory).toBe(true);
  expect(files[0]!.is_directory).toBe(true);
  // Files carry name/extension/size.
  expect(byPath["deck.pptx"]).toMatchObject({ name: "deck.pptx", extension: "pptx", is_directory: false });
  expect(byPath["data/sales.csv"]).toMatchObject({ name: "sales.csv", extension: "csv" });
  expect(byPath["data/sales.csv"]!.size).toBeGreaterThan(0);
});

test("conversation/settings data outside workspace/ is NOT listed", async () => {
  const { deps: d, objects } = deps();
  await objects.writeText(`${PREFIX}/data/conversations/c1.json`, "{}");
  await seed(objects, "report.txt", "x");
  const files = await listWorkspace(d, PREFIX);
  expect(files.map((f) => f.path)).toEqual(["report.txt"]);
});

test("reads text as content, binary as base64", async () => {
  const { deps: d, objects } = deps();
  await seed(objects, "notes.txt", "hello world");
  await objects.writeText(`${PREFIX}/workspace/blob.bin`, "PK\uFFFD\uFFFD payload"); // U+FFFD => treated as binary
  const text = await readWorkspaceFile(d, PREFIX, "notes.txt");
  expect(text).toEqual({ content: "hello world", base64: false });
  const bin = await readWorkspaceFile(d, PREFIX, "blob.bin");
  expect(bin?.base64).toBe(true);
  expect(await readWorkspaceFile(d, PREFIX, "missing.txt")).toBeNull();
});

test("delete removes a file; delete of a folder removes everything under it", async () => {
  const { deps: d, objects } = deps();
  await seed(objects, "keep.txt", "k");
  await seed(objects, "trash/a.txt", "a");
  await seed(objects, "trash/b.txt", "b");
  await deleteWorkspaceFile(d, PREFIX, "trash");
  const paths = (await listWorkspace(d, PREFIX)).map((f) => f.path);
  expect(paths).toEqual(["keep.txt"]);
});

test("rename moves a file within its folder, preserving content", async () => {
  const { deps: d, objects } = deps();
  await seed(objects, "data/old.csv", "1,2,3");
  await renameWorkspaceFile(d, PREFIX, "data/old.csv", "new.csv");
  expect(await readWorkspaceFile(d, PREFIX, "data/new.csv")).toEqual({ content: "1,2,3", base64: false });
  expect(await readWorkspaceFile(d, PREFIX, "data/old.csv")).toBeNull();
});

test("createFolder makes an empty folder visible via a hidden marker", async () => {
  const { deps: d } = deps();
  expect(await createWorkspaceFolder(d, PREFIX, "Reports")).toBe("Reports");
  const files = await listWorkspace(d, PREFIX);
  expect(files.find((f) => f.path === "Reports")?.is_directory).toBe(true);
  // The .keep marker is hidden from the listing.
  expect(files.some((f) => f.name === ".keep")).toBe(false);
});

test("path traversal and absolute paths are rejected everywhere", async () => {
  const { deps: d } = deps();
  await expect(readWorkspaceFile(d, PREFIX, "../auth.json")).rejects.toThrow(FilePathError);
  await expect(readWorkspaceFile(d, PREFIX, "/etc/passwd")).rejects.toThrow(FilePathError);
  await expect(deleteWorkspaceFile(d, PREFIX, "../../other")).rejects.toThrow(FilePathError);
  await expect(renameWorkspaceFile(d, PREFIX, "a.txt", "../evil")).rejects.toThrow(FilePathError);
  await expect(renameWorkspaceFile(d, PREFIX, "a.txt", "sub/evil")).rejects.toThrow(FilePathError);
  await expect(createWorkspaceFolder(d, PREFIX, "../evil")).rejects.toThrow(FilePathError);
});


function fakeRes() {
  const state = { status: 0, headers: {} as Record<string, unknown>, body: null as Buffer | null };
  const res = {
    writeHead(code: number, h?: Record<string, unknown>) {
      state.status = code;
      if (h) Object.assign(state.headers, h);
      return this;
    },
    end(buf?: Buffer | string) {
      if (buf !== undefined) state.body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    },
  };
  return { res: res as never, state };
}

test("download serves raw bytes with the right MIME + disposition", async () => {
  const { deps: d, objects } = deps();
  // Non-UTF-8 payload: must come back byte-for-byte, not JSON/base64.
  const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  await objects.writeBytes(`${PREFIX}/workspace/deck.pptx`, payload);

  const { res, state } = fakeRes();
  const handled = await handleFileRequest(
    d,
    PREFIX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    res,
    new URLSearchParams({ path: "deck.pptx" }),
  );
  expect(handled).toBe(true);
  expect(state.status).toBe(200);
  expect(state.headers["Content-Type"]).toBe(
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  expect(String(state.headers["Content-Disposition"])).toContain('attachment; filename="deck.pptx"');
  expect(Buffer.compare(state.body!, payload)).toBe(0);
});

test("download honors disposition=inline, 404s on missing, rejects traversal", async () => {
  const { deps: d, objects } = deps();
  await objects.writeBytes(`${PREFIX}/workspace/chart.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  expect(mimeFor("Reporte Ventas.PDF")).toBe("application/pdf");
  expect(mimeFor("weird.bin")).toBe("application/octet-stream");
  expect(contentDisposition("inline", "caf\u00e9.pdf")).toBe(
    `inline; filename="caf_.pdf"; filename*=UTF-8''caf%C3%A9.pdf`,
  );

  const inline = fakeRes();
  await handleFileRequest(
    d,
    PREFIX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    inline.res,
    new URLSearchParams({ path: "chart.png", disposition: "inline" }),
  );
  expect(inline.state.status).toBe(200);
  expect(String(inline.state.headers["Content-Disposition"]).startsWith("inline;")).toBe(true);

  const missing = fakeRes();
  await handleFileRequest(
    d,
    PREFIX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    missing.res,
    new URLSearchParams({ path: "missing.pdf" }),
  );
  expect(missing.state.status).toBe(404);

  const evil = fakeRes();
  await handleFileRequest(
    d,
    PREFIX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    evil.res,
    new URLSearchParams({ path: "../data/conversations/c1.json" }),
  );
  expect(evil.state.status).toBe(400);
});
