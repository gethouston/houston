import { randomUUID } from "node:crypto";
import { lstat, readlink, rm } from "node:fs/promises";
import { posix } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { fileSha256 } from "./file-hash";
import type { HydrateManifestEntry } from "./hydrate";
import { linkHash } from "./object-attrs";
import {
  ObjectNotFoundError,
  type ObjectStore,
  ObjectTooLargeError,
  type ReadResult,
  StoreConflictError,
} from "./object-store";
import { sourceVanished } from "./sync-back-merge-retry";

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
  conflictCopy?: string;
  skipped?: string;
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

type RemoteState =
  | { kind: "gone" }
  | { kind: "refused" }
  | { kind: "same" | "different"; generation?: string };

async function readRemote(
  store: ObjectStore,
  key: string,
  abs: string,
  hash: string,
): Promise<RemoteState> {
  const temp = atomicTempPath(abs, `${randomUUID()}.remote`);
  try {
    const read: ReadResult = store.downloadVersioned
      ? await store.downloadVersioned(key, temp)
      : ((await store.download(key, temp)) ?? {});
    if (read.refused) return { kind: "refused" };
    const info = await lstat(temp);
    const remoteHash = info.isSymbolicLink()
      ? linkHash(await readlink(temp))
      : await fileSha256(temp, info.size);
    const same = remoteHash === hash.replace(/:x$/, "");
    return { kind: same ? "same" : "different", generation: read.generation };
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return { kind: "gone" };
    throw error;
  } finally {
    await rm(temp, { force: true });
  }
}

const TAKEN = Symbol("taken");

async function createOnly(
  store: ObjectStore,
  abs: string,
  key: string,
): Promise<string | undefined | typeof TAKEN> {
  try {
    const result = await store.upload(abs, key, { ifGenerationMatch: "0" });
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
  conflict: string;
}): Promise<ConflictCopyResult> {
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      const remote = await readRemote(
        opts.store,
        opts.key,
        opts.abs,
        opts.hash,
      );
      if (remote.kind === "refused")
        return {
          entry: opts.previous,
          uploaded: false,
          conflict: opts.conflict,
        };
      if (remote.kind === "same")
        return {
          entry: { hash: opts.hash, generation: remote.generation },
          uploaded: true,
        };
      if (remote.kind === "gone") {
        const generation = await createOnly(opts.store, opts.abs, opts.key);
        if (generation === TAKEN) continue;
        return { entry: { hash: opts.hash, generation }, uploaded: true };
      }
      const date = new Date().toISOString().slice(0, 10);
      for (let attempt = 1; attempt <= COPY_NAMES; attempt += 1) {
        const copy = conflictCopyName(opts.relativePath, date, attempt);
        const copyKey = conflictCopyName(opts.key, date, attempt);
        if ((await createOnly(opts.store, opts.abs, copyKey)) === TAKEN)
          continue;
        return {
          entry: { hash: opts.hash, generation: remote.generation },
          uploaded: false,
          conflictCopy: copy,
        };
      }
      return {
        entry: opts.previous,
        uploaded: false,
        conflict: `${opts.relativePath}: every conflict copy name is taken`,
      };
    }
    return { entry: opts.previous, uploaded: false, conflict: opts.conflict };
  } catch (error) {
    if (sourceVanished(error)) return { uploaded: false, vanished: true };
    if (error instanceof ObjectTooLargeError)
      return {
        entry: { hash: opts.hash },
        uploaded: false,
        skipped: error.message,
      };
    throw error;
  }
}
