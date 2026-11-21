import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Artifact } from "./types";

const encodedSize = (rawBytes: number) => Math.ceil(rawBytes / 3) * 4;

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
        continue;
      const buf = await readFile(abs);
      const encoded = encodedSize(buf.byteLength);
      if (total + encoded > maxBytes) {
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
