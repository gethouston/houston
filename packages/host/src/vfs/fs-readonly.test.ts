import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";
import { PrefixedVfs } from "./prefixed";
import { VfsReadOnlyError } from "./vfs";

const ROOT = "Houston/Bo";
const isRoot = process.getuid?.() === 0;

async function lockedWorkspace(): Promise<{ vfs: FsVfs; unlock: () => void }> {
  const root = join(mkdtempSync(join(tmpdir(), "houston-readonly-")), "store");
  const vfs = new FsVfs(root);
  await vfs.writeText(`${ROOT}/report.txt`, "kept");
  await vfs.writeText(`${ROOT}/old/notes.txt`, "kept");
  const locked = [root, join(root, ...ROOT.split("/"))];
  for (const dir of locked) chmodSync(dir, 0o500);
  return {
    vfs,
    unlock: () => {
      for (const dir of locked) chmodSync(dir, 0o700);
    },
  };
}

test.skipIf(isRoot)(
  "every write primitive names a storage that refuses writes",
  async () => {
    const { vfs, unlock } = await lockedWorkspace();
    try {
      await expect(
        vfs.writeText(`${ROOT}/draft.txt`, "new"),
      ).rejects.toBeInstanceOf(VfsReadOnlyError);
      await expect(
        vfs.writeBytes(`${ROOT}/draft.bin`, Buffer.from("new")),
      ).rejects.toBeInstanceOf(VfsReadOnlyError);
      await expect(vfs.deleteKey(`${ROOT}/report.txt`)).rejects.toBeInstanceOf(
        VfsReadOnlyError,
      );
      await expect(
        vfs.move(`${ROOT}/report.txt`, `${ROOT}/renamed.txt`),
      ).rejects.toBeInstanceOf(VfsReadOnlyError);
      await expect(vfs.deletePrefix(`${ROOT}/old`)).rejects.toBeInstanceOf(
        VfsReadOnlyError,
      );
      await expect(vfs.keyCase()).rejects.toBeInstanceOf(VfsReadOnlyError);
    } finally {
      unlock();
    }
  },
);

test.skipIf(isRoot)(
  "the refusal carries the errno that raised it",
  async () => {
    const { vfs, unlock } = await lockedWorkspace();
    try {
      const refused = vfs.deleteKey(`${ROOT}/report.txt`);
      await expect(refused).rejects.toMatchObject({
        name: "VfsReadOnlyError",
        cause: { code: expect.stringMatching(/^(EACCES|EPERM|EROFS)$/) },
      });
    } finally {
      unlock();
    }
  },
);

test.skipIf(isRoot)(
  "reads keep answering on an unwritable workspace",
  async () => {
    const { vfs, unlock } = await lockedWorkspace();
    try {
      expect(await vfs.readText(`${ROOT}/report.txt`)).toBe("kept");
      expect((await vfs.list(ROOT)).length).toBe(2);
    } finally {
      unlock();
    }
  },
);

test.skipIf(isRoot)(
  "a move that cannot even look at its source stays a read failure",
  async () => {
    const root = join(mkdtempSync(join(tmpdir(), "houston-sealed-")), "store");
    const vfs = new FsVfs(root);
    await vfs.writeText(`${ROOT}/sealed/report.txt`, "kept");
    const sealed = join(root, ...ROOT.split("/"), "sealed");
    chmodSync(sealed, 0o600);
    try {
      await expect(
        vfs.move(`${ROOT}/sealed/report.txt`, `${ROOT}/report.txt`),
      ).rejects.toMatchObject({ code: "EACCES" });
      await expect(
        vfs.move(`${ROOT}/sealed/report.txt`, `${ROOT}/report.txt`),
      ).rejects.not.toBeInstanceOf(VfsReadOnlyError);
    } finally {
      chmodSync(sealed, 0o700);
    }
  },
);

test.skipIf(isRoot)("the refusal survives a re-rooting adapter", async () => {
  const { vfs, unlock } = await lockedWorkspace();
  try {
    const prefixed = new PrefixedVfs(vfs, "Houston");
    await expect(prefixed.deleteKey("Bo/report.txt")).rejects.toBeInstanceOf(
      VfsReadOnlyError,
    );
  } finally {
    unlock();
  }
});
