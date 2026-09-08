import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";

/**
 * A filesystem reports its stamps as floats. Rounding one to whole
 * milliseconds must TRUNCATE: rounding up names an instant that has not
 * happened, so a file could report itself created after the moment it was
 * read - which is what made the Vfs contract's `createdMs` assertion fail on
 * roughly every other run.
 *
 * One file's fraction lands under .5 half the time, so the invariant is
 * checked over a batch: the odds of a false pass are 2^-32.
 */
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
