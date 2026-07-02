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

/**
 * Popular apps, pinned in this order when the user is not searching.
 * Connecting opens the app's own OAuth consent (Composio hosts the dance).
 */
export const COMMON_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "slack",
  "notion",
  "github",
  "linear",
] as const;

/** How many search results to render (the catalog holds ~1000 apps). */
export const SEARCH_RESULT_LIMIT = 24;

/**
 * The "Add apps" list: not searching → the pinned popular apps (in
 * COMMON_TOOLKITS order); searching → case-insensitive name/slug matches,
 * name-prefix hits first, capped. Already-connected apps never appear.
 * Pure so both behaviors are unit-testable.
 */
export function filterCatalog(opts: {
  catalog: IntegrationToolkit[];
  query: string;
  connected: ReadonlySet<string>;
  popular?: readonly string[];
  limit?: number;
}): IntegrationToolkit[] {
  const popular = opts.popular ?? COMMON_TOOLKITS;
  const limit = opts.limit ?? SEARCH_RESULT_LIMIT;
  const available = opts.catalog.filter((t) => !opts.connected.has(t.slug));
  const q = opts.query.trim().toLowerCase();

  if (!q) {
    const bySlug = new Map(available.map((t) => [t.slug, t]));
    return popular
      .map((slug) => bySlug.get(slug))
      .filter((t): t is IntegrationToolkit => t !== undefined);
  }

  const matches = available.filter(
    (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
  );
  matches.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bPrefix = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aPrefix - bPrefix || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
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
