import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { matchesQuery } from "../integrations/browse-model.ts";

/**
 * HOU-1193: demand for apps Houston doesn't carry. When a settled catalog
 * search matches NOTHING in the whole catalog, the query IS the missing app's
 * name — report it (PostHog `integration_unsupported_searched`) so the team
 * sees which unsupported integrations users keep asking for, deduped to one
 * vote per user by counting unique persons.
 */

/** Longest query worth reporting — beyond this it's a paste, not an app name. */
const MAX_QUERY_LENGTH = 80;

/**
 * The normalized query to report as an unsupported-integration request, or
 * `null` when there is nothing to report: the query is too short to mean an
 * app, the catalog hasn't loaded yet (an empty catalog matches nothing — that
 * is loading, not demand), or SOME toolkit matches it anywhere in the catalog
 * (name, slug, or description — deliberately generous, and deliberately
 * ignoring the surface's category filter and connected-exclusion: an app
 * hidden by either is supported, not missing).
 */
export function unsupportedQueryOf(
  catalog: readonly IntegrationToolkit[],
  query: string,
): string | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > MAX_QUERY_LENGTH) return null;
  if (catalog.length === 0) return null;
  return catalog.some((t) => matchesQuery(t, q)) ? null : q;
}
