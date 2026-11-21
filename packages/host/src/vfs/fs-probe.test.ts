import { chmodSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";
import { VfsReadOnlyError } from "./vfs";

const base = () => mkdtempSync(join(tmpdir(), "houston-probe-"));
const isRoot = process.getuid?.() === 0;

test("the probe never creates the workspace directory", async () => {
  const dir = base();
  const root = join(dir, "not-yet", "Houston");
  const vfs = new FsVfs(root);

  await vfs.keyCase();

  expect(existsSync(root)).toBe(false);
  expect(existsSync(join(dir, "not-yet"))).toBe(false);
  expect(await readdir(dir)).toEqual([]);
});

test.skipIf(isRoot)(
  "an answer borrowed from an ancestor is not remembered",
  async () => {
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
