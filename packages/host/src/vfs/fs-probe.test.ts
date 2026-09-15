import { chmodSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";
import { VfsReadOnlyError } from "./vfs";

/**
 * The case probe is a READ-shaped question ("how does this volume compare
 * names?") that has to write one scratch file to answer. Both facts about it
 * matter to a user: it must not bring the workspace directory into existence
 * on the way, and an answer it had to borrow from an ancestor is never
 * remembered. A storage that refuses the probe's write is a read-only volume,
 * covered with every other write primitive in `fs-readonly.test.ts`.
 */

const base = () => mkdtempSync(join(tmpdir(), "houston-probe-"));
const isRoot = process.getuid?.() === 0;

test("the probe never creates the workspace directory", async () => {
  const dir = base();
  const root = join(dir, "not-yet", "Houston");
  const vfs = new FsVfs(root);

  await vfs.keyCase();

  expect(existsSync(root)).toBe(false);
  expect(existsSync(join(dir, "not-yet"))).toBe(false);
  // …and it cleans up after itself in the ancestor it borrowed.
  expect(await readdir(dir)).toEqual([]);
});

test.skipIf(isRoot)(
  "an answer borrowed from an ancestor is not remembered",
  async () => {
    // The borrowed answer is right about the volume but not about the
    // directory, which does not exist yet: a bind mount or a removable disk
    // can still appear there. Proven by making the real root unaskable — a
    // remembered answer would sail past it.
    const dir = base();
    const root = join(dir, "later");
    const vfs = new FsVfs(root);
    expect((await vfs.keyCase()).fold).toMatch(/^(exact|folded)$/);

    mkdirSync(root, { mode: 0o500 });
    try {
      await expect(vfs.keyCase()).rejects.toBeInstanceOf(VfsReadOnlyError);
    } finally {
      chmodSync(root, 0o700);
    }
  },
);
