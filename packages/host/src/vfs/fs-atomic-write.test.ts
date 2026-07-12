import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";

// The torn-read regression (list_conversations 500 "not valid JSON"): a plain
// in-place write let a concurrent reader observe a truncated file. writeBytes
// must land atomically — full new content or full old content, never a slice —
// and must leave no .tmp behind.

test("writeBytes replaces content atomically and cleans its tmp", async () => {
  const root = mkdtempSync(join(tmpdir(), "vfs-atomic-"));
  const vfs = new FsVfs(root);

  await vfs.writeText("a/activity.json", JSON.stringify([{ id: 1 }]));
  const big = JSON.stringify(Array.from({ length: 5000 }, (_, i) => ({ i })));

  // Hammer overlapping writes while reading — every observed read must parse.
  const writes = Array.from({ length: 25 }, (_, i) =>
    vfs.writeText("a/activity.json", i % 2 ? big : JSON.stringify([{ i }])),
  );
  const reads = Array.from({ length: 25 }, async () => {
    const raw = readFileSync(join(root, "a/activity.json"), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
  await Promise.all([...writes, ...reads]);

  // Final state is one of the two full payloads, and no tmp file lingers.
  const final = readFileSync(join(root, "a/activity.json"), "utf8");
  expect(() => JSON.parse(final)).not.toThrow();
  expect(
    readdirSync(join(root, "a")).filter((f) => f.includes(".tmp")),
  ).toEqual([]);
});
