import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";

/**
 * The integrations provider (platform mode): Houston holds the platform key
 * server-side; the user only OAuths the apps themselves — no Composio account,
 * no sign-in step in this tab.
 */
export const INTEGRATION_PROVIDER = "composio";

/** How long to wait between connection polls, and how many times to poll. */
export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_ATTEMPTS = 150; // ~5 min at 2s/attempt.

/** Page size for the browse grid's "Load more" (catalog holds ~1000 apps). */
export const BROWSE_PAGE_SIZE = 100;

/**
 * The browse grid's contents: already-connected apps never appear; an active
 * category narrows first; a search query then matches name/slug/description
 * case-insensitively. Catalog order is preserved (the provider serves it
 * usage-ranked). Pure so it's unit-testable.
 */
export function browseCatalog(opts: {
  catalog: IntegrationToolkit[];
  query: string;
  category: string;
  connected: ReadonlySet<string>;
}): IntegrationToolkit[] {
  let filtered = opts.catalog.filter((t) => !opts.connected.has(t.slug));
  if (opts.category !== "all") {
    filtered = filtered.filter((t) =>
      (t.categories ?? []).includes(opts.category),
    );
  }
  const q = opts.query.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }
  return filtered;
}

/** Every category present in the catalog, sorted by display label. */
export function categoriesOf(catalog: IntegrationToolkit[]): string[] {
  const seen = new Set<string>();
  for (const t of catalog) {
    for (const c of t.categories ?? []) seen.add(c);
  }
  return [...seen].sort((a, b) =>
    categoryLabel(a).localeCompare(categoryLabel(b)),
  );
}

/** "developer-tools" → "Developer tools". */
export function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, " ");
}

/**
 * Outcome of the post-connect poll loop. `timeout` and `error` are first-class
 * results, NOT silent fall-throughs: the caller MUST surface them so an
 * abandoned or failed browser OAuth never leaves the user staring at a stopped
 * spinner with no explanation.
 */
export type PollOutcome = "active" | "error" | "timeout" | "cancelled";

/**
 * Poll one connection until the user finishes the app's OAuth in their browser,
 * it fails, the loop times out, or the user leaves the tab. Pure +
 * dependency-injected so the timeout and cancellation paths are unit-testable
 * without real timers:
 *
 *  - `poll`        — one connection-status call (already routed through
 *                    `call()`, so a network failure rejects here and the
 *                    caller surfaces it).
 *  - `sleep`       — the inter-attempt delay (real `setTimeout` in prod).
 *  - `isCancelled` — read before every wait + poll so leaving the tab stops the
 *                    loop immediately instead of running out the full 5 minutes.
 *
 * Returns `"active"` on success, `"error"` if the OAuth failed or was revoked,
 * `"cancelled"` if the user left mid-flow, and `"timeout"` once the attempt
 * budget is spent while still pending.
 */
export async function pollConnectionUntilActive(deps: {
  poll: () => Promise<IntegrationConnection>;
  sleep: (ms: number) => Promise<void>;
  isCancelled: () => boolean;
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<PollOutcome> {
  const maxAttempts = deps.maxAttempts ?? POLL_MAX_ATTEMPTS;
  const intervalMs = deps.intervalMs ?? POLL_INTERVAL_MS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (deps.isCancelled()) return "cancelled";
    await deps.sleep(intervalMs);
    if (deps.isCancelled()) return "cancelled";
    const conn = await deps.poll();
    if (conn.status === "active") return "active";
    if (conn.status === "error") return "error";
  }
  return "timeout";
}
