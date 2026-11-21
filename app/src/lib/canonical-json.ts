export function canonicalJson(value: unknown): string {
  return JSON.stringify(withSortedKeys(value)) ?? "undefined";
}

function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = withSortedKeys(source[key]);
  }
  return sorted;
}
