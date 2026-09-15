import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";
import { PrefixedVfs } from "./prefixed";
import { VfsReadOnlyError } from "./vfs";

/**
 * A workspace directory the process cannot write to — a read-only mount, a
 * recovered disk image, a folder whose permissions were revoked, a sync client
 * holding it. EVERY write primitive has to name that state here, at the one
 * seam every writer passes: the Files tab's delete and rename, an upload, a
 * skill save and a `.houston/` document write all reach storage through this
 * port, so a per-caller errno check would cover whichever caller someone
 * remembered and leave the rest answering a 500 with a scratch file's name in
 * it.
 *
 * Skipped as root, which walks through mode bits.
 */

const ROOT = "Houston/Bo"; // local layout: the agent dir IS the workspace root
const isRoot = process.getuid?.() === 0;

/**
 * A store with content, then locked to r-x the way a `:ro` mount presents it:
 * the vfs root (what the case probe writes into) AND the agent's own directory
 * (what every op writes into), both readable and neither writable.
 */
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
      // Each of these is a different user action — save, delete, rename,
      // delete a folder — and each used to surface as a generic 500.
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
      // The case probe is a read-shaped question that has to write one scratch
      // file to answer, so it fails first on such a volume.
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
      // Nothing is swallowed on the way: the original errno stays reachable for
      // the log and for Sentry, while the route above gets a state it can name.
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
    // The folder is unwritable, not unreadable — which is exactly the asymmetry
    // the Files tab's copy describes, so a read must not be re-labelled here.
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
    // A move is two reads (the `lstat` guards that decide whether `rename(2)`
    // would eat a neighbour) and then one write. Only the write half can be
    // refused BY the storage; a parent the process may not traverse fails the
    // reads with the very same EACCES. Labelling that a refusal to write would
    // put "check the folder's permissions, we could not save there" in front of
    // a person whose file Houston could not so much as look at, and would hide
    // the real fault from the log.
    const root = join(mkdtempSync(join(tmpdir(), "houston-sealed-")), "store");
    const vfs = new FsVfs(root);
    await vfs.writeText(`${ROOT}/sealed/report.txt`, "kept");
    const sealed = join(root, ...ROOT.split("/"), "sealed");
    // rw- : readable and writable, but NOT traversable, so `lstat` on anything
    // inside it answers EACCES while the directory itself still takes writes.
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
  // The cloud op path addresses every workspace file through PrefixedVfs. An
  // adapter that swallowed or re-typed the refusal would leave the pod
  // answering a 500 where the desktop explains itself.
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
