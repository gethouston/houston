import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { FsVfs } from "./fs";
import { PrefixedVfs } from "./prefixed";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vfs-write-from-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

test("writeFileFrom publishes a copy of a local file and leaves no scratch file", async () => {
  const source = join(dir, "staged.bin");
  await writeFile(source, Buffer.alloc(1024 * 1024, 9));
  const vfs = new FsVfs(join(dir, "root"));
  await vfs.writeFileFrom("ws/a/uploads/big.bin", source);
  expect(await readFile(join(dir, "root/ws/a/uploads/big.bin"))).toEqual(
    Buffer.alloc(1024 * 1024, 9),
  );
  expect(await readdir(join(dir, "root/ws/a/uploads"))).toEqual(["big.bin"]);
  expect(await readFile(source)).toHaveLength(1024 * 1024);
});

test("writeFileFrom refuses a key outside the root, also through a prefix", async () => {
  const source = join(dir, "staged.bin");
  await writeFile(source, "x");
  const vfs = new FsVfs(join(dir, "root"));
  // The key check throws before any I/O, exactly as writeBytes does.
  expect(() => vfs.writeFileFrom("../escape.bin", source)).toThrow(
    /unsafe vfs key/,
  );
  const prefixed = new PrefixedVfs(vfs, "workspaces");
  await prefixed.writeFileFrom?.("a/b.txt", source);
  expect(await readFile(join(dir, "root/workspaces/a/b.txt"), "utf8")).toBe(
    "x",
  );
});
