import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { PREFERENCES_NAMESPACE } from "@houston/domain";
import { DRAIN_STAMP_FILE } from "@houston/host/src/store-sync/drain-stamp";
import type {
  ObjectMetadata,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import { resolveListedLayout, TurnSetupError } from "./turn-layout";

export type SeedListing =
  | { kind: "empty" }
  | { kind: "adopt"; id: string; workspaceRel: string }
  | { kind: "refuse"; reason: string };

export async function listPrefix(
  store: ObjectStore,
  prefix: string,
): Promise<{ objects: ObjectMetadata[]; rels: string[] }> {
  const objects = store.manifest
    ? await store.manifest(prefix)
    : (await store.list(prefix)).map((key) => ({
        key,
        size: 0,
        md5: "",
        updated: "",
      }));
  const rels: string[] = [];
  for (const { key } of objects) {
    if (!prefix) rels.push(key);
    else if (key.startsWith(`${prefix}/`))
      rels.push(key.slice(prefix.length + 1));
  }
  return { objects, rels };
}

export async function classifySeedListing(
  rels: readonly string[],
  root: string,
): Promise<SeedListing> {
  const relevant = rels.filter(
    (rel) =>
      rel !== DRAIN_STAMP_FILE &&
      !rel.startsWith(`workspaces/${PREFERENCES_NAMESPACE}/`),
  );
  if (relevant.length === 0) return { kind: "empty" };
  try {
    const layout = await resolveListedLayout(
      await mkdtemp(join(root, "listing-")),
      rels,
      { allowEmpty: false },
    );
    if (layout.kind !== "standing")
      return { kind: "refuse", reason: "legacy per-turn layout" };
    return {
      kind: "adopt",
      id: layout.workspaceRel.replace(/^workspaces\//, ""),
      workspaceRel: layout.workspaceRel,
    };
  } catch (error) {
    if (error instanceof TurnSetupError)
      return { kind: "refuse", reason: error.message };
    throw error;
  }
}
