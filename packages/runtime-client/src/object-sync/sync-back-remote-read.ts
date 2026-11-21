import { readFile, rm } from "node:fs/promises";
import type { ObjectMetadata } from "./object-manifest";
import { ObjectNotFoundError, type ObjectStore } from "./object-store";

export type RefreshManifest = (
  key: string,
  fresh?: boolean,
) => Promise<ObjectMetadata | null | undefined>;

export interface RemoteDocument {
  body?: string;
  generation: string;
}

const CREATE_ONLY: RemoteDocument = { generation: "0" };

export async function readRemoteDocument(
  store: ObjectStore,
  key: string,
  temp: string,
  refresh: RefreshManifest,
  fresh: boolean,
): Promise<RemoteDocument | undefined> {
  try {
    let generation: string | undefined;
    if (store.downloadVersioned) {
      generation = (await store.downloadVersioned(key, temp)).generation;
    } else {
      const current = await refresh(key, fresh);
      if (current === undefined) return undefined;
      if (current === null) return CREATE_ONLY;
      generation = current.generation;
      await store.download(key, temp);
    }
    if (generation === undefined) return undefined;
    return { body: await readFile(temp, "utf8"), generation };
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return CREATE_ONLY;
    throw error;
  } finally {
    await rm(temp, { force: true });
  }
}
