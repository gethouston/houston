import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileSha256 } from "./file-hash";
import type { HydrateManifest } from "./hydrate";
import { ObjectNotFoundError, type ObjectStore } from "./object-store";

export interface HydrateEntry {
  generation?: string;
  key: string;
  rel: string;
}

export interface HydrateDownloadState {
  total: number;
  failed: boolean;
  firstError?: unknown;
}

/** Download one hydration batch while sharing the cap and failure latch. */
export async function downloadHydrationEntries(opts: {
  store: ObjectStore;
  destDir: string;
  entries: HydrateEntry[];
  manifest: HydrateManifest;
  maxBytes: number;
  concurrency: number;
  state: HydrateDownloadState;
  limitError: (observedBytes: number) => Error;
}): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (!opts.state.failed && opts.state.total <= opts.maxBytes) {
      const entry = opts.entries[next++];
      if (!entry) return;
      const { generation, key, rel } = entry;
      try {
        const dest = join(opts.destDir, ...rel.split("/"));
        await opts.store.download(key, dest);
        const { size } = await stat(dest);
        opts.state.total += size;
        if (opts.state.total > opts.maxBytes) {
          throw opts.limitError(opts.state.total);
        }
        opts.manifest.set(rel, {
          hash: await fileSha256(dest, size),
          generation,
        });
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          await rm(join(opts.destDir, ...rel.split("/")), { force: true });
          continue;
        }
        if (!opts.state.failed) {
          opts.state.failed = true;
          opts.state.firstError = error;
        }
        return;
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(opts.concurrency, opts.entries.length) },
      worker,
    ),
  );
  if (opts.state.failed) throw opts.state.firstError;
}
