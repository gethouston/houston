export interface ScopeRow {
  slug: string;
  name: string;
}

export function normalizeAppName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function exactScopeRows<T extends ScopeRow>(
  rows: T[],
  app: string,
): T[] {
  const scope = normalizeAppName(app);
  if (!scope) return [];
  return rows.filter(
    (r) =>
      normalizeAppName(r.slug) === scope || normalizeAppName(r.name) === scope,
  );
}

export function resolveScopeRows<T extends ScopeRow>(
  rows: T[],
  app: string,
): T[] {
  const scope = normalizeAppName(app);
  if (!scope) return [];
  const exact = exactScopeRows(rows, app);
  if (exact.length > 0) return exact.slice(0, 3);
  if (scope.length < 3) return [];
  const distance = (r: ScopeRow) =>
    Math.min(
      ...[normalizeAppName(r.name), normalizeAppName(r.slug)]
        .filter(
          (s) => s.length >= 3 && (s.includes(scope) || scope.includes(s)),
        )
        .map((s) => Math.abs(s.length - scope.length)),
    );
  const near = rows
    .map((r) => ({ r, d: distance(r) }))
    .filter((x) => x.d !== Number.POSITIVE_INFINITY)
    .sort((a, b) => a.d - b.d);
  return near.slice(0, 1).map((x) => x.r);
}
