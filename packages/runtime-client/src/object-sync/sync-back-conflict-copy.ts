import { posix } from "node:path";
import type { HydrateManifestEntry } from "./hydrate";
import {
  type ObjectStore,
  ObjectTooLargeError,
  ObjectWriteRefusedError,
  StoreConflictError,
} from "./object-store";
import { sourceVanished } from "./sync-back-merge-retry";
import { readRemoteObject } from "./sync-back-remote-read";
import type { ConflictCopy, SentHashes } from "./sync-back-types";

const ROUNDS = 3;
const COPY_NAMES = 5;
const MAX_NAME_BYTES = 255;
const MAX_EXT_BYTES = 64;

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

export interface ConflictCopyResult {
  entry?: HydrateManifestEntry;
  uploaded: boolean;
  conflict?: string;
  vanished?: boolean;
  conflictCopy?: ConflictCopy;
  skipped?: string;
  refused?: boolean;
}

export function conflictCopyName(
  relativePath: string,
  date: string,
  attempt: number,
): string {
  const dir = posix.dirname(relativePath);
  const base = posix.basename(relativePath);
  const tag =
    attempt === 1 ? `(conflict ${date})` : `(conflict ${date} ${attempt})`;
  const dot = base.lastIndexOf(".");
  const split = dot > 0 && bytes(base.slice(dot)) <= MAX_EXT_BYTES;
  const ext = split ? base.slice(dot) : "";
  const stem = [...(split ? base.slice(0, dot) : base)];
  const suffix = ` ${tag}${ext}`;
  while (
    stem.length > 1 &&
    bytes(stem.join("")) + bytes(suffix) > MAX_NAME_BYTES
  )
    stem.pop();
  const name = `${stem.join("")}${suffix}`;
  return dir === "." ? name : posix.join(dir, name);
}

const TAKEN = Symbol("taken");

async function writeAt(
  store: ObjectStore,
  abs: string,
  key: string,
  generation = "0",
): Promise<string | undefined | typeof TAKEN> {
  try {
    const result = await store.upload(abs, key, {
      ifGenerationMatch: generation,
    });
    return result?.generation;
  } catch (error) {
    if (error instanceof StoreConflictError) return TAKEN;
    throw error;
  }
}

export async function keepRemoteBesideLocal(opts: {
  store: ObjectStore;
  abs: string;
  key: string;
  relativePath: string;
  hash: string;
  previous?: HydrateManifestEntry;
  keptCopy?: ConflictCopy;
  sentHashes?: SentHashes;
  conflict: string;
}): Promise<ConflictCopyResult> {
  const keyOf = (copy: string) =>
    `${opts.key.slice(0, opts.key.length - opts.relativePath.length)}${copy}`;
  const beside = (copy: string, generation: string | undefined) => ({
    ...(opts.previous
      ? { entry: { hash: opts.hash, generation: opts.previous.generation } }
      : {}),
    uploaded: false,
    conflictCopy: { key: opts.relativePath, copy, generation },
  });
  const lost = {
    entry: opts.previous,
    uploaded: false,
    conflict: opts.conflict,
  };
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      const remote = await readRemoteObject(
        opts.store,
        opts.key,
        opts.abs,
        opts.hash,
      );
      if (remote.kind === "refused") return lost;
      // Bytes this turn uploaded itself (a pass whose result was lost) are
      // the turn's own earlier write, not another writer's change.
      const ownEarlier =
        remote.kind === "different" &&
        opts.sentHashes?.get(opts.relativePath)?.has(remote.hash) === true;
      if (ownEarlier || (remote.kind === "same" && opts.hash.endsWith(":x"))) {
        if (remote.generation === undefined) return lost;
        const generation = await writeAt(
          opts.store,
          opts.abs,
          opts.key,
          remote.generation,
        );
        if (generation === TAKEN) continue;
        return { entry: { hash: opts.hash, generation }, uploaded: true };
      }
      if (remote.kind === "same")
        return {
          entry: { hash: opts.hash, generation: remote.generation },
          uploaded: true,
        };
      if (remote.kind === "gone") {
        const generation = await writeAt(opts.store, opts.abs, opts.key);
        if (generation === TAKEN) continue;
        return { entry: { hash: opts.hash, generation }, uploaded: true };
      }
      const kept = opts.keptCopy;
      if (kept?.generation !== undefined) {
        const at = keyOf(kept.copy);
        const generation = await writeAt(
          opts.store,
          opts.abs,
          at,
          kept.generation,
        );
        if (generation !== TAKEN) return beside(kept.copy, generation);
      }
      const date = new Date().toISOString().slice(0, 10);
      for (let attempt = 1; attempt <= COPY_NAMES; attempt += 1) {
        const copy = conflictCopyName(opts.relativePath, date, attempt);
        const generation = await writeAt(opts.store, opts.abs, keyOf(copy));
        if (generation !== TAKEN) return beside(copy, generation);
      }
      return {
        entry: opts.previous,
        uploaded: false,
        conflict: `${opts.relativePath}: every conflict copy name is taken`,
      };
    }
    return lost;
  } catch (error) {
    if (sourceVanished(error)) return { uploaded: false, vanished: true };
    if (error instanceof ObjectTooLargeError)
      return {
        entry: { hash: opts.hash },
        uploaded: false,
        skipped: error.message,
        ...(error instanceof ObjectWriteRefusedError ? { refused: true } : {}),
      };
    throw error;
  }
}
