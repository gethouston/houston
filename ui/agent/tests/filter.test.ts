import assert from "node:assert/strict";
import test from "node:test";
import { filterFolder, folderChildCount, matchesQuery } from "../src/filter.ts";
import type { FolderNode, TreeNode } from "../src/tree.ts";
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

const names = (nodes: TreeNode[]): string[] =>
  nodes.map((n) => (n.kind === "folder" ? n.name : n.entry.name));

const folder = (path: string): FolderNode => {
  const node = folderAtPath(tree, path);
  assert.ok(node, `missing folder ${path}`);
  return node;
};

test("matchesQuery is a case-insensitive substring test", () => {
  assert.equal(matchesQuery("W2.pdf", "w2"), true);
  assert.equal(matchesQuery("readme.md", "ME."), true);
  assert.equal(matchesQuery("readme.md", "notes"), false);
});

test("a blank query returns the folder untouched", () => {
  assert.equal(filterFolder(tree, ""), tree);
  assert.equal(filterFolder(tree, "   "), tree);
});

test("keeps files that match at the level they live on", () => {
  assert.deepEqual(names(filterFolder(folder("2025"), "notes").children), [
    "notes.txt",
  ]);
});

test("keeps a folder whose descendant matches, pruning the rest", () => {
  const filtered = filterFolder(tree, "w2");
  assert.deepEqual(names(filtered.children), ["2025"]);
  const y2025 = filtered.children[0];
  assert.equal(y2025.kind, "folder");
  assert.deepEqual(names(y2025.children), ["taxes"]);
  const taxes = y2025.children[0];
  assert.equal(taxes.kind, "folder");
  assert.deepEqual(names(taxes.children), ["W2.pdf"]);
});

test("a folder whose own name matches brings its whole subtree", () => {
  const filtered = filterFolder(folder("2025"), "taxes");
  assert.deepEqual(names(filtered.children), ["taxes"]);
  const taxes = filtered.children[0];
  assert.equal(taxes.kind, "folder");
  assert.deepEqual(names(taxes.children), ["W2.pdf", "receipts"]);
});

test("matching is case-insensitive across folders and files", () => {
  assert.deepEqual(names(filterFolder(tree, "ARCHIVE").children), ["Archive"]);
  const filtered = filterFolder(folder("2025/taxes"), "COFFEE");
  assert.deepEqual(names(filtered.children), ["receipts"]);
});

test("no match anywhere yields an empty folder, never null", () => {
  const filtered = filterFolder(tree, "nothing-here");
  assert.deepEqual(filtered.children, []);
  assert.equal(filtered.path, tree.path);
});

test("a pruned folder still reports its TRUE child count", () => {
  // "2025" survives only because W2.pdf is buried in it; the card must state
  // the folder's real size (taxes + notes.txt), not the one surviving branch.
  const filtered = filterFolder(tree, "w2");
  const y2025 = filtered.children[0];
  assert.equal(y2025.kind, "folder");
  assert.equal(y2025.children.length, 1);
  assert.equal(folderChildCount(y2025), 2);

  // The same one level down: taxes really holds W2.pdf AND receipts.
  const taxes = y2025.children[0];
  assert.equal(taxes.kind, "folder");
  assert.equal(folderChildCount(taxes), 2);
});

test("an unpruned folder's count is simply its children", () => {
  assert.equal(folderChildCount(folder("2025")), 2);
  // A folder kept by its OWN name brings its whole subtree, so nothing to fix.
  const filtered = filterFolder(folder("2025"), "taxes");
  const taxes = filtered.children[0];
  assert.equal(taxes.kind, "folder");
  assert.equal(folderChildCount(taxes), 2);
});

test("filtering never mutates the source tree", () => {
  const before = names(tree.children);
  filterFolder(tree, "w2");
  assert.deepEqual(names(tree.children), before);
  assert.deepEqual(names(folder("2025").children), ["taxes", "notes.txt"]);
});
