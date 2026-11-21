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

const newer = (local: Entry, remote: Entry): Entry =>
  stamp(remote) > stamp(local) ? remote : local;

function resolve(
  base: Entry | undefined,
  local: Entry | undefined,
  remote: Entry | undefined,
): Entry | undefined {
  if (local && remote) {
    if (!base) return newer(local, remote);
    if (isDeepStrictEqual(local, base)) return remote;
    if (isDeepStrictEqual(remote, base)) return local;
    return newer(local, remote);
  }
  if (base) return undefined;
  return local ?? remote;
}

export function mergeKeyedArrays(
  remote: readonly unknown[],
  local: readonly unknown[],
  field: string,
  base?: readonly unknown[],
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
