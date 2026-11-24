import type { HydrateEntry } from "./hydrate-download";
import { excluded } from "./hydrate-excludes";
import type { ObjectMetadata } from "./object-manifest";
import type { ObjectStore } from "./object-store";

export type HydrateCandidate = HydrateEntry & { updated?: string };

export interface ListedCandidates {
  candidates: HydrateCandidate[];
  sizes: Map<string, number>;
  generationAware: boolean;
}

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
      ...("link" in object && object.link !== undefined
        ? { link: object.link }
        : {}),
      ...("executable" in object && object.executable
        ? { executable: true as const }
        : {}),
      ...("updated" in object && object.updated
        ? { updated: object.updated }
        : {}),
    });
  }
  const listed = new Set(candidates.map(({ key }) => key));
  for (const key of opts.reads ?? []) {
    const rel = relOf(key);
    if (!rel || listed.has(key) || excluded(rel, opts.excludes)) continue;
    candidates.push({
      key,
      rel,
      fromRead: true,
      ...(generationAware ? { requireGeneration: true as const } : {}),
    });
  }
  return { candidates, sizes, generationAware };
}

export function unowned(entry: HydrateEntry, generation?: string): boolean {
  return entry.requireGeneration === true && generation === undefined;
}
