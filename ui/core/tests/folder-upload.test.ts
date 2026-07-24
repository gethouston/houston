import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachmentFolderRoot,
  attachmentRelativePath,
  visibleAttachmentFiles,
} from "../src/folder-upload.ts";

/** A File the way a folder pick produces it: `webkitRelativePath` set. */
function folderFile(name: string, relPath: string): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "webkitRelativePath", {
    value: relPath,
    configurable: true,
  });
  return file;
}

test("attachmentRelativePath normalizes separators and ignores plain files", () => {
  assert.equal(
    attachmentRelativePath(folderFile("a.md", "docs/guide/a.md")),
    "docs/guide/a.md",
  );
  assert.equal(
    attachmentRelativePath(folderFile("a.md", "docs\\guide\\a.md")),
    "docs/guide/a.md",
  );
  assert.equal(
    attachmentRelativePath(folderFile("a.md", "/docs/a.md")),
    "docs/a.md",
  );
  // No separator ⇒ carries no structure ⇒ plain.
  assert.equal(attachmentRelativePath(folderFile("a.md", "a.md")), null);
  assert.equal(attachmentRelativePath(new File(["x"], "plain.md")), null);
});

test("attachmentFolderRoot is the first path segment", () => {
  assert.equal(
    attachmentFolderRoot(folderFile("a.md", "docs/sub/a.md")),
    "docs",
  );
  assert.equal(attachmentFolderRoot(new File(["x"], "plain.md")), null);
});

test("visibleAttachmentFiles drops hidden folder entries, keeps plain dotfiles", () => {
  const visible = folderFile("a.md", "docs/a.md");
  const hiddenFile = folderFile(".DS_Store", "docs/.DS_Store");
  const hiddenDir = folderFile("config", "docs/.git/config");
  const plainDotfile = new File(["x"], ".env"); // explicit pick: host rejects loudly
  assert.deepEqual(
    visibleAttachmentFiles([visible, hiddenFile, hiddenDir, plainDotfile]),
    [visible, plainDotfile],
  );
});
