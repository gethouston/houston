import type { HydrateEntry } from "./hydrate-download";
import { excluded } from "./hydrate-excludes";
import type { ObjectMetadata } from "./object-manifest";
import type { ObjectStore } from "./object-store";

/** A listed (or point-read) object hydration may land. */
export type HydrateCandidate = HydrateEntry & { updated?: string };

/** The candidates of one listing, after the caller's excludes. */
export interface ListedCandidates {
  candidates: HydrateCandidate[];
  /** Listed sizes by relative path (point reads have none). */
  sizes: Map<string, number>;
  generationAware: boolean;
}

/** List `prefix` whole: the store's manifest, or its key listing. */
export async function listWhole(
  store: ObjectStore,
  prefix: string,
): Promise<
  readonly (ObjectMetadata | { key: string; generation: undefined })[]
> {
  const objects = store.manifest ? await store.manifest(prefix) : undefined;
  return (
    objects ??
    (await store.list(prefix)).map((key) => ({ key, generation: undefined }))
  );
}

/** Turn listed objects and point-read keys into hydration candidates. */
export function hydrateCandidates(opts: {
  objects: readonly (ObjectMetadata | { key: string; generation: undefined })[];
  reads?: readonly string[];
  prefix: string;
  excludes: string[];
  sizes?: Map<string, number>;
}): ListedCandidates {
  const sizes = opts.sizes ?? new Map<string, number>();
  const candidates: HydrateCandidate[] = [];
  let generationAware = false;
  const relOf = (key: string) =>
    opts.prefix ? key.slice(opts.prefix.length + 1) : key;
  for (const object of opts.objects) {
    const { key } = object;
    const rel = relOf(key);
    if (!rel || excluded(rel, opts.excludes)) continue;
    if (object.generation !== undefined) generationAware = true;
    if ("size" in object) sizes.set(rel, object.size);
    candidates.push({
      key,
      rel,
      generation: object.generation,
      ...("updated" in object && object.updated
        ? { updated: object.updated }
        : {}),
    });
  }
  const listed = new Set(candidates.map(({ key }) => key));
  for (const key of opts.reads ?? []) {
    const rel = relOf(key);
    if (!rel || listed.has(key) || excluded(rel, opts.excludes)) continue;
    candidates.push({ key, rel, fromRead: true });
  }
  return { candidates, sizes, generationAware };
}
