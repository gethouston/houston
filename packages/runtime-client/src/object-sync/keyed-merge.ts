import { isDeepStrictEqual } from "node:util";

type Entry = Record<string, unknown>;

const isEntry = (value: unknown): value is Entry =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function keyOf(value: unknown, field: string): string | undefined {
  if (!isEntry(value)) return undefined;
  const key = value[field];
  return typeof key === "string" ? key : undefined;
}

function byKey(items: readonly unknown[], field: string): Map<string, Entry> {
  const out = new Map<string, Entry>();
  for (const item of items) {
    const key = keyOf(item, field);
    if (key !== undefined && isEntry(item)) out.set(key, item);
  }
  return out;
}

function stamp(entry: Entry): number {
  const parsed =
    typeof entry.updated_at === "string"
      ? Date.parse(entry.updated_at)
      : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** The later `updated_at` wins; without a later remote stamp the local side
 *  does, as every merged write did before merges kept a base. */
const newer = (local: Entry, remote: Entry): Entry =>
  stamp(remote) > stamp(local) ? remote : local;

/**
 * A state no writer ever undoes, so the side holding it wins regardless of
 * stamps or base. Learnings carry no `updated_at`, and an archived memory is
 * never un-archived (consolidation is one-way), so a stale active copy must
 * not resurrect it.
 */
export type StickyState = (entry: Entry) => boolean;

/** A learning consolidation archived (`Learning.archived_at`). */
export const archivedLearning: StickyState = (entry) =>
  typeof entry.archived_at === "string";

/** One key's entry after the merge; undefined = it is gone. */
function resolve(
  base: Entry | undefined,
  local: Entry | undefined,
  remote: Entry | undefined,
  sticky?: StickyState,
): Entry | undefined {
  if (local && remote) {
    // By design, a concurrent text edit of a memory being archived loses.
    if (sticky && sticky(local) !== sticky(remote))
      return sticky(local) ? local : remote;
    if (!base) return newer(local, remote);
    if (isDeepStrictEqual(local, base)) return remote;
    if (isDeepStrictEqual(remote, base)) return local;
    // Both changed it. An entry's fields hang together (a routine's schedule
    // or trigger, a provider and its model, a definition's kind and source),
    // so the newer side's whole entry lands, never a mix of the two.
    return newer(local, remote);
  }
  // In the base and missing from one side: that side deleted it, explicitly.
  // An edit on the other side never brings it back.
  if (base) return undefined;
  return local ?? remote;
}

/**
 * Merge a writer's keyed array (routines and memories by `id`, custom
 * integration definitions by `slug`) into the remote copy it lost a
 * generation race to.
 *
 * With `base` (the bytes the writer started from) this is three-way per
 * entry: an entry the writer left untouched takes the remote's copy, so a
 * stale local copy never reverts another writer's edit; one both changed
 * goes whole to the newer side; one either side deleted stays deleted. Without a base (the standing pod's sync) the
 * author of a difference is unknowable: both sides' entries survive, and an
 * entry both hold resolves by `updated_at`, else to the local copy.
 *
 * `sticky` names a one-way state (an archived learning) whose holder wins
 * any conflict, base or not.
 *
 * Remote entries the writer lacks come first, then the writer's own in its
 * order: the order every merged write has kept. Entries without a key are
 * kept from both sides.
 */
export function mergeKeyedArrays(
  remote: readonly unknown[],
  local: readonly unknown[],
  field: string,
  base?: readonly unknown[],
  sticky?: StickyState,
): unknown[] {
  const baseEntries = base ? byKey(base, field) : new Map<string, Entry>();
  const localEntries = byKey(local, field);
  const remoteEntries = byKey(remote, field);
  const merged: unknown[] = [];
  const emitted = new Set<string>();
  const emit = (key: string) => {
    if (emitted.has(key)) return;
    emitted.add(key);
    const entry = resolve(
      baseEntries.get(key),
      localEntries.get(key),
      remoteEntries.get(key),
      sticky,
    );
    if (entry) merged.push(entry);
  };
  for (const item of remote) {
    const key = keyOf(item, field);
    if (key === undefined) merged.push(item);
    else if (!localEntries.has(key)) emit(key);
  }
  for (const item of local) {
    const key = keyOf(item, field);
    if (key === undefined) merged.push(item);
    else emit(key);
  }
  return merged;
}
