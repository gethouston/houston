import { test, expect } from "bun:test";
import { MemoryObjectFiles } from "./objects";
import {
  FilePathError,
  createWorkspaceFolder,
  deleteWorkspaceFile,
  listWorkspace,
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

function deps(): { deps: TurnDeps; objects: MemoryObjectFiles } {
  const objects = new MemoryObjectFiles();
  return { deps: { objects } as unknown as TurnDeps, objects };
}

async function seed(objects: MemoryObjectFiles, rel: string, content: string) {
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
