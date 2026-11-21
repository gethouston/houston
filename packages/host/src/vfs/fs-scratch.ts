import { rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import type { KeyCase } from "./vfs";

export { ATOMIC_TMP_SUFFIX, isAtomicTemp } from "@houston/protocol";

const uniqueInfix = () =>
  `${process.pid}.${Math.random().toString(36).slice(2, 8)}`;

export function scratchPath(base: string): string {
  return atomicTempPath(base, uniqueInfix());
}

const PROBE_STEM = "houston-case-probe-ñ";

export interface ProbeResult {
  keyCase: KeyCase;
  memoizable: boolean;
}

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

async function resolves(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

async function nearestExisting(root: string): Promise<string> {
  let dir = root;
  for (;;) {
    try {
      if ((await stat(dir)).isDirectory()) return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no directory to probe for: ${root}`);
    dir = parent;
  }
}
