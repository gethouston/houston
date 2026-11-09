import type { Stats } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { ATOMIC_TMP_SUFFIX } from "@houston/protocol";

const RETENTION_MS = 30 * 24 * 60 * 60_000;
const MAX_BYTES = 1024 * 1024 * 1024;

/** Prune only completed entries and temp files old enough to be abandoned. */
export async function pruneOfficeCache(cacheDir: string): Promise<void> {
  const now = Date.now();
  const entries = [];
  for (const name of await readdir(cacheDir)) {
    const path = join(cacheDir, name);
    let info: Stats;
    try {
      info = await stat(path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        continue;
      throw error;
    }
    if (name.endsWith(ATOMIC_TMP_SUFFIX)) {
      if (now - info.mtimeMs > 60 * 60_000) await rm(path, { force: true });
    } else if (name.endsWith(".pdf")) {
      const metadata = path.replace(/\.pdf$/, ".json");
      let metadataSize = 0;
      try {
        metadataSize = (await stat(metadata)).size;
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
      entries.push({
        path,
        metadata,
        size: info.size + metadataSize,
        modified: info.mtimeMs,
      });
    }
  }
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of entries.sort((a, b) => a.modified - b.modified)) {
    if (now - entry.modified <= RETENTION_MS && total <= MAX_BYTES) continue;
    await rm(entry.path, { force: true });
    await rm(entry.metadata, { force: true });
    total -= entry.size;
  }
}
