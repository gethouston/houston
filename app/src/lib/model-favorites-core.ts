export const DEFAULT_MAX_RECENTS = 4;

export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === "string");
}

export function toggleInList(list: readonly string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((entry) => entry !== id)
    : [...list, id];
}

export function pushToFront(
  list: readonly string[],
  id: string,
  max = DEFAULT_MAX_RECENTS,
): string[] {
  const deduped = [id, ...list.filter((entry) => entry !== id)];
  return deduped.slice(0, Math.max(0, max));
}
