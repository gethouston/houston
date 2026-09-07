/**
 * Provider-neutral app-scope resolution (PRODUCT-1274): every integration
 * provider resolves the agent's `app` scope with the SAME rules, so one scope
 * means one thing across the multi-provider merge — a scope Composio resolves
 * must not silently mean something looser to the custom provider.
 */
export interface ScopeRow {
  slug: string;
  name: string;
}

/** Normalize an app name/slug/query for matching: lowercase, drop every
 *  non-alphanumeric char so "Google Sheets", "google-sheets" and
 *  "googlesheets" all collapse to one comparable form. */
export function normalizeAppName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The rows whose normalized slug or name EQUALS the scope — the tier that
 *  wins outright, exposed so a caller can tell "named exactly" from "near". */
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

/**
 * Resolve an EXPLICIT app scope (search's `app` argument — a loose name or
 * slug the model heard from the user) against rows. EXACT normalized
 * slug/name matches win outright and skip every length guard — a legitimately
 * short app name ("HR") must resolve when passed exactly. Otherwise substring
 * containment EITHER way ("google sheet" ⊂ "googlesheets") yields only the
 * SINGLE closest candidate, judged on whichever of name/slug matched closer —
 * a loose scope ("hub" ⊂ github AND hubspot) must never hard-scope to several
 * unrelated apps, which would recreate the very ranking pollution the scope
 * exists to eliminate.
 */
export function resolveScopeRows<T extends ScopeRow>(
  rows: T[],
  app: string,
): T[] {
  const scope = normalizeAppName(app);
  if (!scope) return [];
  const exact = exactScopeRows(rows, app);
  if (exact.length > 0) return exact.slice(0, 3);
  if (scope.length < 3) return [];
  // Distance to the closest containing/contained name or slug; Infinity when
  // neither side matches (Math.min of nothing).
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
