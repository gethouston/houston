import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";

const FILES = 32;

test("no reported stamp is later than the instant it names", async () => {
  const root = mkdtempSync(join(tmpdir(), "vfs-stamps-"));
  const vfs = new FsVfs(root);
  for (let i = 0; i < FILES; i++) {
    await vfs.writeText(`a/doc-${i}.txt`, `v${i}`);
  }

  const listed = await vfs.listDetailed("a");
  expect(listed).toHaveLength(FILES);
  for (const entry of listed) {
    const raw = statSync(join(root, entry.key));
    expect(entry.updatedMs).toBeLessThanOrEqual(raw.mtimeMs);
    expect(Number.isInteger(entry.updatedMs)).toBe(true);
    if (entry.createdMs === undefined) continue;
    expect(entry.createdMs).toBeLessThanOrEqual(raw.birthtimeMs);
    expect(Number.isInteger(entry.createdMs)).toBe(true);
  }
});
