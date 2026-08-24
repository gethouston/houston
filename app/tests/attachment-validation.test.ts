import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  MAX_COMPOSER_ATTACHMENT_BYTES,
  splitComposerAttachments,
  validateComposerAttachment,
} from "../src/lib/attachment-validation.ts";

describe("composer attachment validation", () => {
  it("rejects disk images before they enter the composer draft", () => {
    const reason = validateComposerAttachment({
      name: "bank-export.dmg",
      size: 10,
      type: "application/x-apple-diskimage",
    });

    deepStrictEqual(reason, { kind: "blockedType", extension: "dmg" });
  });

  it("keeps valid files when one selected file is unsupported", () => {
    const result = splitComposerAttachments([
      { name: "statement-1.pdf", size: 1024, type: "application/pdf" },
      { name: "installer.dmg", size: 1024, type: "" },
      { name: "receipt.png", size: 1024, type: "image/png" },
    ]);

    deepStrictEqual(
      result.accepted.map((file) => file.name),
      ["statement-1.pdf", "receipt.png"],
    );
    strictEqual(result.rejected.length, 1);
  });

  it("accepts video and audio files like any other workspace file", () => {
    strictEqual(
      validateComposerAttachment({
        name: "demo.mp4",
        size: 50 * 1024 * 1024,
        type: "video/mp4",
      }),
      null,
    );
    strictEqual(
      validateComposerAttachment({
        name: "meeting.m4a",
        size: 12 * 1024 * 1024,
        type: "audio/mp4",
      }),
      null,
    );
    strictEqual(
      validateComposerAttachment({
        name: "clip.mov",
        size: 1024,
        type: "",
      }),
      null,
    );
  });

  it("accepts standard archives: zip and the tar family", () => {
    for (const file of [
      { name: "project.zip", size: 1024, type: "application/zip" },
      { name: "backup.tar.gz", size: 1024, type: "application/gzip" },
      { name: "logs.tgz", size: 1024, type: "" },
      { name: "data.tar", size: 1024, type: "application/x-tar" },
      { name: "dump.tar.zst", size: 1024, type: "" },
    ]) {
      strictEqual(validateComposerAttachment(file), null, file.name);
    }
  });

  it("still rejects archives the agent has no stock tool for", () => {
    deepStrictEqual(
      validateComposerAttachment({
        name: "vault.7z",
        size: 1024,
        type: "application/x-7z-compressed",
      }),
      { kind: "blockedType", extension: "7z" },
    );
    deepStrictEqual(
      validateComposerAttachment({ name: "old.rar", size: 1024, type: "" }),
      { kind: "blockedType", extension: "rar" },
    );
  });

  it("still applies the size cap to archives", () => {
    deepStrictEqual(
      validateComposerAttachment({
        name: "huge.zip",
        size: MAX_COMPOSER_ATTACHMENT_BYTES + 1,
        type: "application/zip",
      }),
      { kind: "tooLarge", maxBytes: MAX_COMPOSER_ATTACHMENT_BYTES },
    );
  });

  it("still applies the size cap to media files", () => {
    deepStrictEqual(
      validateComposerAttachment({
        name: "feature-film.mp4",
        size: MAX_COMPOSER_ATTACHMENT_BYTES + 1,
        type: "video/mp4",
      }),
      { kind: "tooLarge", maxBytes: MAX_COMPOSER_ATTACHMENT_BYTES },
    );
  });

  it("rejects files above the engine per-file limit", () => {
    const reason = validateComposerAttachment({
      name: "huge.pdf",
      size: MAX_COMPOSER_ATTACHMENT_BYTES + 1,
      type: "application/pdf",
    });

    deepStrictEqual(reason, {
      kind: "tooLarge",
      maxBytes: MAX_COMPOSER_ATTACHMENT_BYTES,
    });
  });
});

describe("composer image gate (model without vision)", () => {
  const noVision = { modelAcceptsImages: false };

  it("rejects an image when the active model cannot view images", () => {
    const reason = validateComposerAttachment(
      { name: "screenshot.png", size: 1024, type: "image/png" },
      noVision,
    );
    deepStrictEqual(reason, { kind: "modelCannotViewImages" });
  });

  it("detects images by extension when the mime type is missing", () => {
    const reason = validateComposerAttachment(
      { name: "photo.HEIC", size: 1024, type: "" },
      noVision,
    );
    deepStrictEqual(reason, { kind: "modelCannotViewImages" });
  });

  it("allows images when the model has vision or capability is unknown", () => {
    const file = { name: "screenshot.png", size: 1024, type: "image/png" };
    strictEqual(
      validateComposerAttachment(file, { modelAcceptsImages: true }),
      null,
    );
    strictEqual(validateComposerAttachment(file, {}), null);
    strictEqual(validateComposerAttachment(file), null);
  });

  it("lets SVG through: it is text any model can read", () => {
    const reason = validateComposerAttachment(
      { name: "diagram.svg", size: 1024, type: "image/svg+xml" },
      noVision,
    );
    strictEqual(reason, null);
  });

  it("leaves non-image files untouched by the gate", () => {
    const reason = validateComposerAttachment(
      { name: "notes.pdf", size: 1024, type: "application/pdf" },
      noVision,
    );
    strictEqual(reason, null);
  });

  it("splits a mixed batch: images rejected, documents kept", () => {
    const result = splitComposerAttachments(
      [
        { name: "brief.pdf", size: 1024, type: "application/pdf" },
        { name: "receipt.jpg", size: 1024, type: "image/jpeg" },
      ],
      noVision,
    );
    deepStrictEqual(
      result.accepted.map((f) => f.name),
      ["brief.pdf"],
    );
    deepStrictEqual(result.rejected[0]?.reason, {
      kind: "modelCannotViewImages",
    });
  });
});
