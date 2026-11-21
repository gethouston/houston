import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { normalizeActivities, parseJsonDoc } from "@houston/domain";
import type { Activity } from "@houston/protocol";
import {
  mergeActivityArrays,
  ObjectNotFoundError,
  type ObjectStore,
  trustedBase,
} from "@houston/runtime-client/object-sync";
import type { TurnFilesystem } from "./turn-filesystem";
import { turnActivityKey } from "./turn-filesystem-scope";

export interface StoredBoard {
  items: Activity[];
  adopt(): void;
}

export type RemoteActivityReader = () => Promise<StoredBoard | null>;

type BoardTree = Pick<
  TurnFilesystem,
  "storeRoot" | "workspaceRel" | "manifest" | "generationAware"
>;

interface StoredRead {
  raw: string;
  hash: string;
  generation?: string;
}

export function remoteActivityReader(
  store: ObjectStore,
  prefix: string,
  tree: BoardTree,
): RemoteActivityReader {
  return async () => {
    const rel = turnActivityKey(tree.workspaceRel);
    const key = prefix ? posix.join(prefix, rel) : rel;
    const read = await readStored(store, key);
    if (!read) return null;
    const previous = tree.manifest.get(rel);
    const stored = parseJsonDoc(read.raw, key);
    const local = await readCards(join(tree.storeRoot, ...rel.split("/")));
    const base = trustedBase(previous);
    const rebased = Array.isArray(stored)
      ? mergeActivityArrays(
          stored,
          local ?? [],
          base === undefined ? undefined : cardsIn(parseJsonDoc(base, key)),
        )
      : stored;
    return {
      items: normalizeActivities(rebased, key).items,
      adopt: () => {
        const generation = read.generation ?? previous?.generation;
        if (generation === undefined && tree.generationAware) return;
        tree.manifest.set(rel, {
          hash: read.hash,
          mergeBase: read.raw,
          ...(generation === undefined ? {} : { generation }),
        });
      },
    };
  };
}

async function readStored(
  store: ObjectStore,
  key: string,
): Promise<StoredRead | null> {
  const dir = await mkdtemp(join(tmpdir(), "mission-title-"));
  const dest = join(dir, "activity.json");
  try {
    let generation: string | undefined;
    if (store.downloadVersioned)
      ({ generation } = await store.downloadVersioned(key, dest));
    else await store.download(key, dest);
    const bytes = await readFile(dest);
    return {
      raw: bytes.toString("utf8"),
      hash: createHash("sha256").update(bytes).digest("hex"),
      ...(generation === undefined ? {} : { generation }),
    };
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readCards(path: string): Promise<unknown[] | undefined> {
  try {
    return cardsIn(parseJsonDoc(await readFile(path, "utf8"), path));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

const cardsIn = (doc: unknown): unknown[] | undefined =>
  Array.isArray(doc) ? doc : undefined;
