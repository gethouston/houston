import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { atomicTempPath } from "@houston/protocol";
import { removedCardIds } from "./activity-merge";
import type { HydrateManifestEntry } from "./hydrate";
import { type ObjectStore, StoreConflictError } from "./object-store";
import { mergeUploadRounds } from "./sync-back-doc-merge";
import { trustedBase, withMergeBase } from "./sync-back-merge-base";
import { mergeOrOverwrite, writeAtomically } from "./sync-back-merge-write";
import {
  type RefreshManifest,
  readRemoteDocument,
} from "./sync-back-remote-read";

export { MERGE_UPLOAD_ATTEMPTS } from "./sync-back-doc-merge";
export type { RefreshManifest } from "./sync-back-remote-read";

export type ConflictBackoff = (retry: number) => number;

export const jitteredConflictBackoff: ConflictBackoff = (retry) =>
  Math.round(Math.min(800, 50 * 2 ** (retry - 1)) * (0.5 + Math.random()));

export interface MergedUploadResult {
  entry?: HydrateManifestEntry;
  uploaded: boolean;
  conflict?: string;
  vanished?: boolean;
  attempts: number;
  removedCards?: string[];
  unmergeable?: string;
}

export async function uploadMergedDocument(opts: {
  store: ObjectStore;
  abs: string;
  key: string;
  relativePath: string;
  previous?: HydrateManifestEntry;
  refresh: RefreshManifest;
  conflict: string;
  backoff?: ConflictBackoff;
}): Promise<MergedUploadResult> {
  const local = await readLocal(opts.abs);
  if (local === undefined)
    return { uploaded: false, vanished: true, attempts: 0 };
  const base = trustedBase(opts.previous);
  const backoff = opts.backoff ?? jitteredConflictBackoff;
  let onDisk = local;
  let conflict = opts.conflict;
  let generation = opts.previous?.generation;
  let attempts = 0;
  let unmergeable: string | undefined;
  const rounds = mergeUploadRounds(opts.relativePath);
  while (attempts < rounds) {
    attempts += 1;
    if (attempts > 1) await sleep(backoff(attempts - 1));
    const temp = atomicTempPath(opts.abs, `${randomUUID()}.remote`);
    const remote = await readRemoteDocument(
      opts.store,
      opts.key,
      temp,
      opts.refresh,
      attempts > 1,
    );
    if (!remote) break;
    const outcome = mergeOrOverwrite(opts.relativePath, local, remote, base);
    const merged = outcome.body;
    unmergeable = outcome.unmergeable;
    if (merged !== onDisk) {
      const current = await readLocal(opts.abs);
      if (current === undefined)
        return { uploaded: false, vanished: true, attempts };
      if (current !== onDisk) {
        conflict = `${opts.relativePath} changed locally during its merge`;
        break;
      }
      await writeAtomically(opts.abs, merged);
      onDisk = merged;
    }
    generation = remote.generation;
    try {
      const result = await opts.store.upload(opts.abs, opts.key, {
        ifGenerationMatch: remote.generation,
      });
      const hash = createHash("sha256").update(merged).digest("hex");
      const removed =
        remote.body === undefined
          ? []
          : removedCardIds(opts.relativePath, remote.body, merged);
      return {
        entry: await withMergeBase(opts.abs, opts.relativePath, {
          hash,
          generation: result?.generation,
        }),
        uploaded: true,
        attempts,
        ...(removed.length > 0 ? { removedCards: removed } : {}),
        ...(unmergeable ? { unmergeable } : {}),
      };
    } catch (error) {
      if (sourceVanished(error))
        return { uploaded: false, vanished: true, attempts };
      if (!(error instanceof StoreConflictError)) throw error;
      conflict = error.message;
    }
  }
  return {
    entry: opts.previous ? { ...opts.previous, generation } : undefined,
    uploaded: false,
    conflict,
    attempts,
    ...(unmergeable ? { unmergeable } : {}),
  };
}

export function sourceVanished(error: unknown): boolean {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
  const cause = (error as { cause?: unknown }).cause;
  return (cause as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

async function readLocal(abs: string): Promise<string | undefined> {
  try {
    return await readFile(abs, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
