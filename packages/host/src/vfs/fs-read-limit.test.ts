import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs, MemoryVfs, PrefixedVfs, VfsReadLimitError } from "./index";

test("bounded reads refuse a sparse oversized source and preserve ordinary downloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "vfs-bounded-"));
  try {
    const vfs = new FsVfs(root);
    const file = await open(join(root, "huge.pptx"), "w");
    await file.truncate(1024 * 1024);
    await file.close();
    await expect(vfs.readBytes("huge.pptx", 8)).rejects.toBeInstanceOf(
      VfsReadLimitError,
    );
    await writeFile(join(root, "small.pptx"), "123456789");
    await expect(vfs.readBytes("small.pptx", 8)).rejects.toBeInstanceOf(
      VfsReadLimitError,
    );
    expect((await vfs.readBytes("small.pptx"))?.toString()).toBe("123456789");
    expect((await vfs.readBytes("small.pptx", 9))?.toString()).toBe(
      "123456789",
    );
    expect(await vfs.readBytes("missing.pptx", 8)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory and prefixed reads preserve the same byte limit", async () => {
  const memory = new MemoryVfs();
  await memory.writeText("workspace/deck.pptx", "office bytes");
  const prefixed = new PrefixedVfs(memory, "workspace");
  await expect(
    memory.readBytes("workspace/deck.pptx", 4),
  ).rejects.toBeInstanceOf(VfsReadLimitError);
  await expect(prefixed.readBytes("deck.pptx", 4)).rejects.toBeInstanceOf(
    VfsReadLimitError,
  );
  expect((await prefixed.readBytes("deck.pptx"))?.toString()).toBe(
    "office bytes",
  );
});
