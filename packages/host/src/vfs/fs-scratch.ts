import { rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import type { KeyCase } from "./vfs";

/**
 * The scratch files `FsVfs` puts inside the workspace it serves — the atomic
 * write's temp target and the one-off case probe — plus the naming convention
 * that keeps a concurrent walk from ever listing one as workspace content.
 */

/**
 * The suffix and its predicate come from `@houston/protocol`: the store-sync
 * walk in `@houston/runtime-client` excludes by exactly this name, and a
 * second definition here would be a leak or a loss the moment either drifted.
 */
export { ATOMIC_TMP_SUFFIX, isAtomicTemp } from "@houston/protocol";

const uniqueInfix = () =>
  `${process.pid}.${Math.random().toString(36).slice(2, 8)}`;

/**
 * A scratch path beside `base`. The unique infix is what lets two concurrent
 * writers (or probes) share a directory without colliding; the suffix is what
 * makes a walk skip it.
 */
export function scratchPath(base: string): string {
  return atomicTempPath(base, uniqueInfix());
}

/**
 * The probe's stem asks both questions at once: it is all lower case (so an
 * upper-cased spelling differs only in case) and it carries a DECOMPOSED ñ
 * (`n` + U+0303), so the composed spelling differs only in normalization.
 */
const PROBE_STEM = "houston-case-probe-ñ";

/** What the probe learned, and whether the answer belongs to `root` itself. */
export interface ProbeResult {
  keyCase: KeyCase;
  /**
   * False when the probe had to run in an ancestor because `root` does not
   * exist yet. Same volume, so the answer is right; but the directory the
   * workspace will live in has not been created, and a bind mount or a
   * removable disk could still be mounted there — so the caller must not
   * remember it.
   */
  memoizable: boolean;
}

/**
 * Ask the VOLUME under `root` how it decides two names are the same file, by
 * writing one scratch file and looking it up under two re-spellings of its
 * name: upper-cased (does it fold case?) and composed (does it normalize?).
 *
 * `process.platform` is NOT the answer: macOS ships case-INSENSITIVE APFS by
 * default but a case-sensitive APFS volume is a supported choice, a Linux host
 * can serve a workspace off an exFAT stick or a SMB share, and a Docker bind
 * mount inherits whatever the host volume does. Only the volume knows, and it
 * answers in one write + two stats.
 *
 * Read-shaped calls must not create directories, so a missing `root` is probed
 * from its nearest existing ancestor rather than conjured with `mkdir -p`: the
 * ancestor is on the same volume and gives the same answer.
 */
export async function probeKeyCase(root: string): Promise<ProbeResult> {
  const dir = await nearestExisting(root);
  const infix = uniqueInfix();
  const spelling = (stem: string) => atomicTempPath(join(dir, stem), infix);
  const written = spelling(PROBE_STEM);
  await writeFile(written, "");
  try {
    const [fold, normalize] = await Promise.all([
      resolves(spelling(PROBE_STEM.toUpperCase())),
      resolves(spelling(PROBE_STEM.normalize("NFC"))),
    ]);
    return {
      keyCase: { fold: fold ? "folded" : "exact", normalize },
      memoizable: dir === root,
    };
  } finally {
    await rm(written, { force: true });
  }
}

/** Whether this spelling reaches the file the probe just wrote. */
async function resolves(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    // Only "it isn't there" answers the question. Anything else (EACCES on a
    // locked-down mount, EIO on a failing disk) is a real fault: throwing beats
    // guessing "exact" and clobbering the user's file on the next rename.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/**
 * `root`, or the closest ancestor that exists. A workspace root is created by
 * the first write into it, so a probe that runs before then still has a
 * directory on the same volume to ask.
 */
async function nearestExisting(root: string): Promise<string> {
  let dir = root;
  for (;;) {
    try {
      if ((await stat(dir)).isDirectory()) return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const parent = dirname(dir);
    // Root of the filesystem: nothing above it to ask, and a volume with no
    // reachable directory is a fault the caller must see, not guess past.
    if (parent === dir) throw new Error(`no directory to probe for: ${root}`);
    dir = parent;
  }
}
