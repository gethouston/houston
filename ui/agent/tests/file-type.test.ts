import assert from "node:assert/strict";
import test from "node:test";
import {
  fileCategory,
  IMAGE_PREVIEW_MAX_BYTES,
  previewKind,
  TEXT_PREVIEW_MAX_BYTES,
} from "../src/file-type.ts";

test("fileCategory classifies common extensions", () => {
  assert.equal(fileCategory("pdf"), "pdf");
  assert.equal(fileCategory("PDF"), "pdf");
  assert.equal(fileCategory("png"), "image");
  assert.equal(fileCategory("tsx"), "code");
  assert.equal(fileCategory("csv"), "sheet");
  assert.equal(fileCategory("zip"), "archive");
  assert.equal(fileCategory("mp3"), "audio");
  assert.equal(fileCategory("mov"), "video");
  assert.equal(fileCategory("md"), "doc");
  assert.equal(fileCategory("json"), "data");
  assert.equal(fileCategory("xyz"), "other");
  assert.equal(fileCategory(""), "other");
});

test("previewKind picks image for small images only", () => {
  assert.equal(previewKind({ extension: "png", size: 1000 }), "image");
  assert.equal(
    previewKind({ extension: "jpg", size: IMAGE_PREVIEW_MAX_BYTES + 1 }),
    null,
  );
});

test("previewKind picks text for small text-ish files only", () => {
  assert.equal(previewKind({ extension: "md", size: 500 }), "text");
  assert.equal(previewKind({ extension: "ts", size: 500 }), "text");
  assert.equal(previewKind({ extension: "json", size: 500 }), "text");
  assert.equal(
    previewKind({ extension: "md", size: TEXT_PREVIEW_MAX_BYTES + 1 }),
    null,
  );
});

test("previewKind is null for folders, binaries and unknowns", () => {
  assert.equal(
    previewKind({ extension: "", size: 0, is_directory: true }),
    null,
  );
  assert.equal(previewKind({ extension: "pdf", size: 500 }), null);
  assert.equal(previewKind({ extension: "zip", size: 500 }), null);
  assert.equal(previewKind({ extension: "docx", size: 500 }), null);
});
