import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isUploadTooLargeError,
  MAX_UPLOAD_FILE_BYTES,
  splitOversizedUploads,
} from "../src/lib/files-upload-limits.ts";

const names = (files: { name: string }[]) => files.map((file) => file.name);

describe("files upload size validation", () => {
  it("mirrors the host cap at 100 MiB", () => {
    strictEqual(MAX_UPLOAD_FILE_BYTES, 100 * 1024 * 1024);
  });

  it("rejects a file above the cap", () => {
    const result = splitOversizedUploads([
      { name: "raw-footage.mov", size: MAX_UPLOAD_FILE_BYTES + 1 },
    ]);

    deepStrictEqual(names(result.accepted), []);
    deepStrictEqual(names(result.oversized), ["raw-footage.mov"]);
  });

  it("rejects a file sitting exactly on the cap", () => {
    // The host measures the base64 payload with an estimator that rounds up, so
    // a file of exactly MAX bytes still 413s there. Catch it client side.
    const result = splitOversizedUploads([
      { name: "exactly-at-the-cap.zip", size: MAX_UPLOAD_FILE_BYTES },
    ]);

    deepStrictEqual(names(result.accepted), []);
    deepStrictEqual(names(result.oversized), ["exactly-at-the-cap.zip"]);
  });

  it("passes files below the cap through untouched", () => {
    const result = splitOversizedUploads([
      { name: "invoice.pdf", size: 2048 },
      { name: "just-under-the-cap.zip", size: MAX_UPLOAD_FILE_BYTES - 1 },
      { name: "empty.txt", size: 0 },
    ]);

    deepStrictEqual(names(result.accepted), [
      "invoice.pdf",
      "just-under-the-cap.zip",
      "empty.txt",
    ]);
    deepStrictEqual(result.oversized, []);
  });

  it("splits a mixed batch instead of refusing all of it", () => {
    const result = splitOversizedUploads([
      { name: "statement-1.pdf", size: 1024 },
      { name: "backup.iso", size: MAX_UPLOAD_FILE_BYTES + 1 },
      { name: "receipt.png", size: 4096 },
      { name: "archive.tar", size: MAX_UPLOAD_FILE_BYTES * 3 },
    ]);

    deepStrictEqual(names(result.accepted), ["statement-1.pdf", "receipt.png"]);
    deepStrictEqual(names(result.oversized), ["backup.iso", "archive.tar"]);
  });

  it("accepts an empty batch without inventing rejections", () => {
    const result = splitOversizedUploads([]);

    deepStrictEqual(result.accepted, []);
    deepStrictEqual(result.oversized, []);
  });
});

describe("host upload size rejection", () => {
  it("recognizes the engine 413", () => {
    ok(isUploadTooLargeError({ status: 413, message: "Payload Too Large" }));
  });

  it("recognizes the host's wording when no status is carried", () => {
    ok(isUploadTooLargeError(new Error("upload exceeds the size limit")));
    ok(isUploadTooLargeError("upload exceeds the size limit"));
  });

  it("leaves every other failure on the report-a-bug path", () => {
    ok(!isUploadTooLargeError(new Error("network request failed")));
    ok(!isUploadTooLargeError({ status: 500 }));
    ok(!isUploadTooLargeError(null));
    ok(!isUploadTooLargeError(undefined));
  });
});
