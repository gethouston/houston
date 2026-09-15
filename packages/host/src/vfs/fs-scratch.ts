import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KeyCase } from "./vfs";

/**
 * The scratch files `FsVfs` puts inside the workspace it serves — the atomic
 * write's temp target and the one-off case probe — plus the naming convention
 * that keeps a concurrent walk from ever listing one as workspace content.
 */

/**
 * Suffix of the scratch files `FsVfs` renames into place or probes with.
 * Distinctive on purpose: a listing hides exactly these and nothing a user
 * could legitimately name (`notes.tmp`, `backup.1.tmp` stay visible).
 */
export const ATOMIC_TMP_SUFFIX = ".houston.tmp";

export const isAtomicTemp = (name: string) => name.endsWith(ATOMIC_TMP_SUFFIX);

/**
 * A scratch path beside `base`. The unique infix is what lets two concurrent
 * writers (or probes) share a directory without colliding; the suffix is what
 * makes a walk skip it.
 */
export function scratchPath(base: string): string {
  const unique = `${process.pid}.${Math.random().toString(36).slice(2, 8)}`;
  return `${base}.${unique}${ATOMIC_TMP_SUFFIX}`;
}

/** The probe's two spellings differ ONLY in the case of this constant stem. */
const PROBE_STEM = "houston-case-probe";

/**
 * Ask the VOLUME under `root` whether it folds letter case, by writing one
 * scratch file under a lowercase name and looking it up under the uppercase
 * one.
 *
 * `process.platform` is NOT the answer: macOS ships case-INSENSITIVE APFS by
 * default but a case-sensitive APFS volume is a supported choice, a Linux host
 * can serve a workspace off an exFAT stick or a SMB share, and a Docker bind
 * mount inherits whatever the host volume does. Only the volume knows, and it
 * answers in one write + one stat.
 */
export async function probeKeyCase(root: string): Promise<KeyCase> {
  await mkdir(root, { recursive: true });
  const unique = `${process.pid}.${Math.random().toString(36).slice(2, 8)}`;
  const written = join(root, `${PROBE_STEM}.${unique}${ATOMIC_TMP_SUFFIX}`);
  const other = join(
    root,
    `${PROBE_STEM.toUpperCase()}.${unique}${ATOMIC_TMP_SUFFIX}`,
  );
  await writeFile(written, "");
  try {
    await stat(other);
    return "folded";
  } catch (err) {
    // Only "it isn't there" answers the question. Anything else (EACCES on a
    // locked-down mount, EIO on a failing disk) is a real fault: throwing beats
    // guessing "exact" and clobbering the user's file on the next rename.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "exact";
    throw err;
  } finally {
    await rm(written, { force: true });
  }
}
