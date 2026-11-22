import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** Every regular file under `dir`, as forward-slash paths relative to `base`. */
export async function walkFiles(
  dir: string,
  base: string,
  links = false,
): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isSymbolicLink() && !links) continue;
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, base, links)));
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}
