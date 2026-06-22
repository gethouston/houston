import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Artifact } from "./types";

/** base64 inflates bytes by ~4/3; budget against the RETURNED size, not raw. */
const encodedSize = (rawBytes: number) => Math.ceil(rawBytes / 3) * 4;

/**
 * Files present after the run that are new or changed (vs seeded inputs), minus
 * the program file. Symlinks are skipped (dirent.isFile() is false for them), so
 * a symlink can't be used to read outside the workdir. The budget is enforced on
 * the ACTUAL bytes read (no stat/read TOCTOU window) and in base64 terms.
 */
export async function collectArtifacts(
  root: string,
  programPath: string,
  seeded: Map<string, number>,
  maxBytes: number,
): Promise<{ artifacts: Artifact[]; dropped: string[] }> {
  const out: Artifact[] = [];
  const dropped: string[] = [];
  let total = 0;

  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile() || abs === programPath) continue;
      const priorBytes = seeded.get(abs);
      if (priorBytes !== undefined && priorBytes === (await stat(abs)).size)
        continue; // unchanged input
      const buf = await readFile(abs);
      const encoded = encodedSize(buf.byteLength);
      if (total + encoded > maxBytes) {
        // Over the (base64) artifact budget. Record it so the caller can tell the
        // model a file was produced but not returned — never a silent drop.
        dropped.push(relative(root, abs));
        continue;
      }
      total += encoded;
      out.push({
        path: relative(root, abs),
        contentBase64: buf.toString("base64"),
        bytes: buf.byteLength,
      });
    }
  };

  await walk(root);
  return { artifacts: out, dropped };
}
