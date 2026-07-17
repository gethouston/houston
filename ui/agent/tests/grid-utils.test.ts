import assert from "node:assert/strict";
import test from "node:test";
import {
  crumbsForPath,
  folderAtPath,
  resolveExistingPath,
} from "../src/grid-utils.ts";
import { buildTree } from "../src/tree.ts";
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
  entry("2025/taxes/w2.pdf"),
  entry("2025/notes.txt"),
]);

test("folderAtPath finds root, nested folders, and misses", () => {
  assert.equal(folderAtPath(tree, ""), tree);
  assert.equal(folderAtPath(tree, "2025")?.name, "2025");
  assert.equal(folderAtPath(tree, "2025/taxes")?.name, "taxes");
  assert.equal(folderAtPath(tree, "2025/missing"), null);
  assert.equal(folderAtPath(tree, "nope"), null);
});

test("folderAtPath never matches a file node", () => {
  assert.equal(folderAtPath(tree, "readme.md"), null);
  assert.equal(folderAtPath(tree, "2025/notes.txt"), null);
});

test("resolveExistingPath keeps valid paths and trims deleted tails", () => {
  assert.equal(resolveExistingPath(tree, ""), "");
  assert.equal(resolveExistingPath(tree, "2025/taxes"), "2025/taxes");
  assert.equal(resolveExistingPath(tree, "2025/taxes/deleted"), "2025/taxes");
  assert.equal(resolveExistingPath(tree, "2025/renamed/deep"), "2025");
  assert.equal(resolveExistingPath(tree, "gone/entirely"), "");
});

test("crumbsForPath builds cumulative paths", () => {
  assert.deepEqual(crumbsForPath(""), []);
  assert.deepEqual(crumbsForPath("2025"), [{ name: "2025", path: "2025" }]);
  assert.deepEqual(crumbsForPath("2025/taxes"), [
    { name: "2025", path: "2025" },
    { name: "taxes", path: "2025/taxes" },
  ]);
});
