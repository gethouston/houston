import assert from "node:assert/strict";
import test from "node:test";
import { collectFilePaths } from "../src/files-selection.ts";
import { filterFolder } from "../src/filter.ts";
import type { FolderNode } from "../src/tree.ts";
import { buildTree, folderAtPath } from "../src/tree.ts";
import type { FileEntry } from "../src/types.ts";

const entry = (path: string, is_directory = false): FileEntry => ({
  path,
  name: path.split("/").pop() ?? path,
  extension: is_directory ? "" : (path.split(".").pop() ?? ""),
  size: 10,
  is_directory,
});

const tree = buildTree([
  entry("readme.md"),
  entry("2025", true),
  entry("2025/taxes", true),
  entry("2025/taxes/W2.pdf"),
  entry("2025/taxes/receipts", true),
  entry("2025/taxes/receipts/coffee.png"),
  entry("2025/notes.txt"),
  entry("Archive", true),
  entry("Archive/old.txt"),
]);

const folder = (path: string): FolderNode => {
  const node = folderAtPath(tree, path);
  assert.ok(node, `missing folder ${path}`);
  return node;
};

test("collects every file in the tree, folders excluded", () => {
  assert.deepEqual(collectFilePaths(tree), [
    "readme.md",
    "2025/taxes/W2.pdf",
    "2025/taxes/receipts/coffee.png",
    "2025/notes.txt",
    "Archive/old.txt",
  ]);
});

test("walks depth-first, in the order the list renders the rows", () => {
  // "taxes" comes before "notes.txt" in 2025's children, so the whole taxes
  // subtree must be enumerated before the sibling file — otherwise shift-less
  // "select all" would check rows in an order the eye cannot follow.
  assert.deepEqual(collectFilePaths(folder("2025")), [
    "2025/taxes/W2.pdf",
    "2025/taxes/receipts/coffee.png",
    "2025/notes.txt",
  ]);
});

test("a folder with no files anywhere under it collects nothing", () => {
  const empty: FolderNode = {
    kind: "folder",
    name: "empty",
    path: "empty",
    children: [
      { kind: "folder", name: "inner", path: "empty/inner", children: [] },
    ],
  };
  assert.deepEqual(collectFilePaths(empty), []);
});

test("a leaf folder collects only its own files", () => {
  assert.deepEqual(collectFilePaths(folder("Archive")), ["Archive/old.txt"]);
});

test("select-all follows the SEARCH: a pruned tree collects only survivors", () => {
  // Fed the filtered tree on purpose — "select all" must never reach rows the
  // query hid, which is why FilesBrowser passes `visibleFolder`, not the root.
  assert.deepEqual(collectFilePaths(filterFolder(tree, "w2")), [
    "2025/taxes/W2.pdf",
  ]);
  assert.deepEqual(collectFilePaths(filterFolder(tree, "nothing-here")), []);
});

test("a folder kept by its OWN name brings its whole subtree's files", () => {
  assert.deepEqual(collectFilePaths(filterFolder(tree, "taxes")), [
    "2025/taxes/W2.pdf",
    "2025/taxes/receipts/coffee.png",
  ]);
});

test("collecting never mutates the tree it walked", () => {
  const before = tree.children.length;
  collectFilePaths(tree);
  assert.equal(tree.children.length, before);
  assert.deepEqual(collectFilePaths(tree).length, 5);
});
