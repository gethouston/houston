import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileSha256 } from "./file-hash";
import type { HydrateManifest } from "./hydrate";
import { unowned } from "./hydrate-candidates";
import type {
  HydrateBudget,
  HydrateDownloadState,
  HydrateEntry,
} from "./hydrate-download";
import type { ObjectStore } from "./object-store";
import { keepsMergeBase } from "./sync-back-doc-merge";

const BATCH_KEYS = 128;
const BATCH_PARALLEL = 4;

export function skipRefusedLanding(key: string): void {
  console.error(
    `[object-sync] hydrate left ${key} out: its private directory was refused`,
  );
}

export async function hydrateBatched(opts: {
  downloadMany: NonNullable<ObjectStore["downloadMany"]>;
  destDir: string;
  entries: HydrateEntry[];
  manifest: HydrateManifest;
  budget: HydrateBudget;
  state: HydrateDownloadState;
  keepMergeBase?: boolean;
  signal: AbortSignal;
  limitError: (observedBytes: number) => Error;
  batchParallel?: number;
}): Promise<HydrateEntry[]> {
  const chunks: HydrateEntry[][] = [];
  for (let index = 0; index < opts.entries.length; index += BATCH_KEYS) {
    chunks.push(opts.entries.slice(index, index + BATCH_KEYS));
  }
  const fallback: HydrateEntry[] = [];
  let next = 0;
  const worker = async () => {
    while (!opts.state.failed) {
      const chunk = chunks[next++];
      if (!chunk) return;
      try {
        await landChunk(opts, chunk, fallback);
      } catch (error) {
        opts.state.fail(error);
        return;
      }
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(opts.batchParallel ?? BATCH_PARALLEL, chunks.length),
      },
      worker,
    ),
  );
  if (opts.state.failed) throw opts.state.firstError;
  return fallback;
}

async function landChunk(
  opts: Parameters<typeof hydrateBatched>[0],
  chunk: HydrateEntry[],
  fallback: HydrateEntry[],
) {
  const dest = (rel: string) => join(opts.destDir, ...rel.split("/"));
  const outcomes = await opts.downloadMany(
    chunk.map(({ key, rel }) => ({ key, destFile: dest(rel) })),
    { signal: opts.signal },
  );
  for (const entry of chunk) {
    if (opts.signal.aborted) return;
    const outcome = outcomes.get(entry.key);
    if (!outcome || outcome.status === "fallback") {
      fallback.push(entry);
      continue;
    }
    if (outcome.status === "missing") {
      await rm(dest(entry.rel), { force: true });
      continue;
    }
    if (outcome.status === "refused") {
      skipRefusedLanding(entry.key);
      continue;
    }
    const { size } = await stat(dest(entry.rel));
    opts.budget.landed += size;
    if (opts.budget.landed > opts.budget.maxBytes) {
      throw opts.limitError(opts.budget.landed);
    }
    if (unowned(entry, outcome.generation)) continue;
    opts.manifest.set(entry.rel, {
      hash: await fileSha256(dest(entry.rel), size),
      generation: entry.fromRead ? outcome.generation : entry.generation,
      ...(opts.keepMergeBase && keepsMergeBase(entry.rel)
        ? { mergeBase: await readFile(dest(entry.rel), "utf8") }
        : {}),
    });
  }
}
