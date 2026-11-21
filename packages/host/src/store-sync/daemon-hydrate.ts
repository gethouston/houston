import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  excluded,
  type HydrateManifest,
  hydrate,
} from "@houston/runtime-client/object-sync";
import { logHydrated } from "./daemon-log";
import {
  DEFAULT_MAX_HYDRATE_BYTES,
  type StoreSyncOptions,
} from "./daemon-policy";

export const FENCE_RETIRED_MARKER = ".houston-fence-retired";

export interface RetireMarker {
  retiredAt: string;
  synced: string[];
}

export async function runHydrate(
  opts: StoreSyncOptions,
  excludes: string[],
): Promise<HydrateManifest> {
  const startedAt = Date.now();
  await mkdir(opts.rootDir, { recursive: true });
  const manifest = await hydrate(opts.store, "", opts.rootDir, {
    excludes,
    maxBytes: opts.maxHydrateBytes ?? DEFAULT_MAX_HYDRATE_BYTES,
  });
  logHydrated(opts, manifest.size, startedAt);
  const marker = await readRetireMarker(
    opts,
    join(opts.rootDir, FENCE_RETIRED_MARKER),
  );
  if (marker) {
    let pruned = 0;
    for (const rel of marker.synced) {
      if (manifest.has(rel) || excluded(rel, excludes)) continue;
      if (rel.split("/").some((seg) => seg === "" || seg === "..")) continue;
      await rm(join(opts.rootDir, ...rel.split("/")), { force: true });
      pruned += 1;
    }
    await rm(join(opts.rootDir, FENCE_RETIRED_MARKER), { force: true });
    opts.log(
      `[store-sync] pruned ${pruned} local files the store dropped while this pod was fenced`,
    );
  }
  return manifest;
}

async function readRetireMarker(
  opts: StoreSyncOptions,
  path: string,
): Promise<RetireMarker | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    opts.log(
      "[store-sync] fence retire marker unreadable; pruning nothing",
      err,
    );
    return undefined;
  }
  const parsed = parseRetireMarker(text);
  if (!parsed) {
    opts.log("[store-sync] fence retire marker unreadable; pruning nothing");
    await rm(path, { force: true });
  }
  return parsed;
}

function parseRetireMarker(text: string): RetireMarker | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { retiredAt, synced } = value as Partial<RetireMarker>;
  if (typeof retiredAt !== "string" || !Array.isArray(synced)) return undefined;
  if (!synced.every((key) => typeof key === "string")) return undefined;
  return { retiredAt, synced };
}
