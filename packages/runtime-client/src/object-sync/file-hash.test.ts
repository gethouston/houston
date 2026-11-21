import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fileSha256, STREAM_HASH_THRESHOLD_BYTES } from "./file-hash";

test("streamed and buffered hashing agree with sha256 of the bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-file-hash-"));
  const small = Buffer.alloc(STREAM_HASH_THRESHOLD_BYTES - 1, 7);
  const large = Buffer.alloc(STREAM_HASH_THRESHOLD_BYTES + 1, 9);
  const smallPath = join(dir, "small.bin");
  const largePath = join(dir, "large.bin");
  writeFileSync(smallPath, small);
  writeFileSync(largePath, large);

  const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  expect(await fileSha256(smallPath, small.length)).toBe(digest(small));
  expect(await fileSha256(largePath, large.length)).toBe(digest(large));
});

test("the streaming threshold is at most 1 MB", () => {
  expect(STREAM_HASH_THRESHOLD_BYTES).toBeLessThanOrEqual(1024 * 1024);
});
