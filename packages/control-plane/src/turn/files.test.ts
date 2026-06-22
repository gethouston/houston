import { test, expect } from "bun:test";
import { MemoryVfs } from "../vfs";
import type { WorkspacePaths } from "../paths";
import type { Agent, Workspace } from "../domain/types";
import {
  FilePathError,
  contentDisposition,
  createWorkspaceFolder,
  deleteWorkspaceFile,
  handleFiles,
  listWorkspace,
  mimeFor,
  readWorkspaceFile,
  renameWorkspaceFile,
} from "./files";

/**
 * The Files tab over an agent's workspace root, served by the host for every
 * profile (cloud GCS prefix `<prefix>/workspace`, local FS `<W>/<A>`). The agent
 * writes files to that root during a turn; these endpoints make them show up, be
 * readable, downloadable, renamable, and deletable. Internal Houston state
 * (`.houston`, `.agents`) is hidden + refused, and path-safety stops a hostile
 * rel-path escaping the root.
 */

const PREFIX = "ws/w1/agent-1";
const ROOT = `${PREFIX}/workspace`; // cloud agentRoot

async function seed(objects: MemoryVfs, rel: string, content: string) {
  await objects.writeText(`${ROOT}/${rel}`, content);
}

/** A paths stub that resolves any agent to ROOT, for the handleFiles HTTP cases. */
const PATHS = { agentRoot: () => ROOT } as unknown as WorkspacePaths;
const CTX = { workspace: {} as Workspace, agent: {} as Agent };

test("lists workspace files with synthesized folders, newest metadata", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "deck.pptx", "PPTX");
  await seed(objects, "data/sales.csv", "a,b\n1,2");
  await seed(objects, "data/notes.txt", "hi");

  const files = await listWorkspace(objects, ROOT);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
  // The folder is synthesized and sorts first.
  expect(byPath.data?.is_directory).toBe(true);
  expect(files[0]?.is_directory).toBe(true);
  // Files carry name/extension/size.
  expect(byPath["deck.pptx"]).toMatchObject({
    name: "deck.pptx",
    extension: "pptx",
    is_directory: false,
  });
  expect(byPath["data/sales.csv"]).toMatchObject({
    name: "sales.csv",
    extension: "csv",
  });
  expect(byPath["data/sales.csv"]?.size).toBeGreaterThan(0);
});

test("conversation/settings data outside the root is NOT listed", async () => {
  const objects = new MemoryVfs();
  await objects.writeText(`${PREFIX}/data/conversations/c1.json`, "{}");
  await seed(objects, "report.txt", "x");
  const files = await listWorkspace(objects, ROOT);
  expect(files.map((f) => f.path)).toEqual(["report.txt"]);
});

test("local layout (no workspace/ split): lists user files, hides .houston/.agents internals", async () => {
  const objects = new MemoryVfs();
  const LOCAL = "Houston/Bo"; // local agentRoot — the agent dir IS the root
  await objects.writeText(`${LOCAL}/report.txt`, "hi");
  await objects.writeText(`${LOCAL}/Decks/q3.pptx`, "PPTX");
  await objects.writeText(`${LOCAL}/CLAUDE.md`, "instructions");
  await objects.writeText(`${LOCAL}/.houston/activity/activity.json`, "[]");
  await objects.writeText(`${LOCAL}/.agents/skills/alarm/SKILL.md`, "x");

  const paths = (await listWorkspace(objects, LOCAL)).map((f) => f.path).sort();
  expect(paths).toContain("report.txt");
  expect(paths).toContain("Decks"); // synthesized folder
  expect(paths).toContain("Decks/q3.pptx");
  expect(paths).toContain("CLAUDE.md");
  // Internal Houston state is never exposed in the Files tab.
  expect(paths.some((p) => p.startsWith(".houston"))).toBe(false);
  expect(paths.some((p) => p.startsWith(".agents"))).toBe(false);
});

test("reads text as content, binary as base64", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "notes.txt", "hello world");
  await objects.writeText(`${ROOT}/blob.bin`, "PK�� payload"); // U+FFFD => treated as binary
  const text = await readWorkspaceFile(objects, ROOT, "notes.txt");
  expect(text).toEqual({ content: "hello world", base64: false });
  const bin = await readWorkspaceFile(objects, ROOT, "blob.bin");
  expect(bin?.base64).toBe(true);
  expect(await readWorkspaceFile(objects, ROOT, "missing.txt")).toBeNull();
});

test("delete removes a file; delete of a folder removes everything under it", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "keep.txt", "k");
  await seed(objects, "trash/a.txt", "a");
  await seed(objects, "trash/b.txt", "b");
  await deleteWorkspaceFile(objects, ROOT, "trash");
  const paths = (await listWorkspace(objects, ROOT)).map((f) => f.path);
  expect(paths).toEqual(["keep.txt"]);
});

test("rename moves a file within its folder, preserving content", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/old.csv", "1,2,3");
  await renameWorkspaceFile(objects, ROOT, "data/old.csv", "new.csv");
  expect(await readWorkspaceFile(objects, ROOT, "data/new.csv")).toEqual({
    content: "1,2,3",
    base64: false,
  });
  expect(await readWorkspaceFile(objects, ROOT, "data/old.csv")).toBeNull();
});

test("createFolder makes an empty folder visible via a hidden marker", async () => {
  const objects = new MemoryVfs();
  expect(await createWorkspaceFolder(objects, ROOT, "Reports")).toBe("Reports");
  const files = await listWorkspace(objects, ROOT);
  expect(files.find((f) => f.path === "Reports")?.is_directory).toBe(true);
  // The .keep marker is hidden from the listing.
  expect(files.some((f) => f.name === ".keep")).toBe(false);
});

test("path traversal and absolute paths are rejected everywhere", async () => {
  const objects = new MemoryVfs();
  await expect(
    readWorkspaceFile(objects, ROOT, "../auth.json"),
  ).rejects.toThrow(FilePathError);
  await expect(readWorkspaceFile(objects, ROOT, "/etc/passwd")).rejects.toThrow(
    FilePathError,
  );
  await expect(
    deleteWorkspaceFile(objects, ROOT, "../../other"),
  ).rejects.toThrow(FilePathError);
  await expect(
    renameWorkspaceFile(objects, ROOT, "a.txt", "../evil"),
  ).rejects.toThrow(FilePathError);
  await expect(
    renameWorkspaceFile(objects, ROOT, "a.txt", "sub/evil"),
  ).rejects.toThrow(FilePathError);
  await expect(createWorkspaceFolder(objects, ROOT, "../evil")).rejects.toThrow(
    FilePathError,
  );
});

test("internal dot-dirs are refused by every path op", async () => {
  const objects = new MemoryVfs();
  await expect(
    readWorkspaceFile(objects, ROOT, ".houston/activity/activity.json"),
  ).rejects.toThrow(FilePathError);
  await expect(deleteWorkspaceFile(objects, ROOT, ".agents")).rejects.toThrow(
    FilePathError,
  );
  await expect(
    renameWorkspaceFile(objects, ROOT, "a.txt", ".hidden"),
  ).rejects.toThrow(FilePathError);
  await expect(createWorkspaceFolder(objects, ROOT, ".secret")).rejects.toThrow(
    FilePathError,
  );
});

function fakeRes() {
  const state = {
    status: 0,
    headers: {} as Record<string, unknown>,
    body: null as Buffer | null,
  };
  const res = {
    writeHead(code: number, h?: Record<string, unknown>) {
      state.status = code;
      if (h) Object.assign(state.headers, h);
      return this;
    },
    end(buf?: Buffer | string) {
      if (buf !== undefined)
        state.body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    },
  };
  return { res: res as never, state };
}

test("download serves raw bytes with the right MIME + disposition", async () => {
  const objects = new MemoryVfs();
  // Non-UTF-8 payload: must come back byte-for-byte, not JSON/base64.
  const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  await objects.writeBytes(`${ROOT}/deck.pptx`, payload);

  const { res, state } = fakeRes();
  const handled = await handleFiles(
    objects,
    PATHS,
    CTX,
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
  expect(String(state.headers["Content-Disposition"])).toContain(
    'attachment; filename="deck.pptx"',
  );
  if (state.body === null) throw new Error("expected response body to be set");
  expect(Buffer.compare(state.body, payload)).toBe(0);
});

test("download honors disposition=inline, 404s on missing, rejects traversal", async () => {
  const objects = new MemoryVfs();
  await objects.writeBytes(
    `${ROOT}/chart.png`,
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  );

  expect(mimeFor("Reporte Ventas.PDF")).toBe("application/pdf");
  expect(mimeFor("weird.bin")).toBe("application/octet-stream");
  expect(contentDisposition("inline", "café.pdf")).toBe(
    `inline; filename="caf_.pdf"; filename*=UTF-8''caf%C3%A9.pdf`,
  );

  const inline = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    CTX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    inline.res,
    new URLSearchParams({ path: "chart.png", disposition: "inline" }),
  );
  expect(inline.state.status).toBe(200);
  expect(
    String(inline.state.headers["Content-Disposition"]).startsWith("inline;"),
  ).toBe(true);

  const missing = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    CTX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    missing.res,
    new URLSearchParams({ path: "missing.pdf" }),
  );
  expect(missing.state.status).toBe(404);

  const evil = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    CTX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    evil.res,
    new URLSearchParams({ path: "../data/conversations/c1.json" }),
  );
  expect(evil.state.status).toBe(400);
});

test("a missing vfs answers 503 for files routes", async () => {
  const { res, state } = fakeRes();
  const handled = await handleFiles(
    undefined,
    PATHS,
    CTX,
    "GET",
    "files",
    { url: "/x" } as never,
    res,
    new URLSearchParams(),
  );
  expect(handled).toBe(true);
  expect(state.status).toBe(503);
});
