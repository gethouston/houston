import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  attachmentUploadDisplay,
  trackAttachmentUpload,
  updateUploadProgress,
} from "../src/lib/upload-progress.ts";

afterEach(() => attachmentUploadDisplay.setState(new Map(), true));

test("progress belongs to the File object, even with identical names", () => {
  const first = new File(["first"], "report.pdf");
  const second = new File(["second"], "report.pdf");
  const progress = updateUploadProgress(new Map(), first, {
    sentBytes: 40,
    totalBytes: 100,
    phase: "uploading",
  });
  assert.deepEqual(progress.get(first), { fraction: 0.4, state: "uploading" });
  assert.equal(progress.get(second), undefined);
});

test("reconnecting preserves the reported fraction and done marks only that file finished", () => {
  const first = new File(["a"], "a.pdf");
  const second = new File(["b"], "b.pdf");
  let progress = updateUploadProgress(new Map(), first, {
    sentBytes: 42,
    totalBytes: 100,
    phase: "reconnecting",
  });
  progress = updateUploadProgress(progress, second, {
    sentBytes: 100,
    totalBytes: 100,
    phase: "saving",
  });
  assert.deepEqual(progress.get(first), {
    fraction: 0.42,
    state: "reconnecting",
  });
  progress = updateUploadProgress(progress, first, {
    sentBytes: 100,
    totalBytes: 100,
    phase: "done",
  });
  assert.deepEqual(progress.get(first), { fraction: 1, state: "done" });
  assert.deepEqual(progress.get(second), { fraction: 1, state: "saving" });
});

test("an empty file has a finite progress value", () => {
  const file = new File([], "empty.txt");
  const progress = updateUploadProgress(new Map(), file, {
    sentBytes: 0,
    totalBytes: 0,
    phase: "uploading",
  });
  assert.equal(progress.get(file)?.fraction, 0);
});

test("the save display follows reconnect and clears when the operation settles", async () => {
  const file = new File(["report"], "report.pdf");
  const result = await trackAttachmentUpload([file], async (onProgress) => {
    assert.equal(attachmentUploadDisplay.getState().get(file)?.fraction, 0);
    onProgress(file, { sentBytes: 3, totalBytes: 6, phase: "reconnecting" });
    assert.deepEqual(attachmentUploadDisplay.getState().get(file), {
      fraction: 0.5,
      state: "reconnecting",
    });
    return ["saved.pdf"];
  });
  assert.deepEqual(result, ["saved.pdf"]);
  assert.equal(attachmentUploadDisplay.getState().size, 0);
});

test("a failed upload clears its display and preserves another in-flight upload", async () => {
  const first = new File(["a"], "report.pdf");
  const second = new File(["b"], "report.pdf");
  await trackAttachmentUpload([first], async () => {
    await assert.rejects(
      trackAttachmentUpload([second], async () => {
        throw new Error("upload refused");
      }),
      /upload refused/,
    );
    assert.equal(attachmentUploadDisplay.getState().has(first), true);
    assert.equal(attachmentUploadDisplay.getState().has(second), false);
  });
  assert.equal(attachmentUploadDisplay.getState().size, 0);
});
