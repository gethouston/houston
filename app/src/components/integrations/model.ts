import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";

/**
 * The integrations provider (platform mode): Houston holds the platform key
 * server-side; the user only OAuths the apps themselves, no Composio account,
 * no sign-in step for the apps.
 */
export const INTEGRATION_PROVIDER = "composio";

/** How long to wait between connection polls, and how many times to poll. */
export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_ATTEMPTS = 150; // ~5 min at 2s/attempt.

/** Page size for the browse grid's "Load more" (catalog holds ~1000 apps). */
export const BROWSE_PAGE_SIZE = 100;

/**
 * The browse grid's contents: an active category narrows first; a search query
 * then matches name/slug/description case-insensitively. `connected` lets the
 * caller exclude already-connected apps (pass an empty set to keep them, e.g.
 * the picker renders them with a connected state instead). Results are sorted
 * ALPHABETICALLY by app name (case-insensitive) AFTER filtering, so a brand-new
 * user scanning 1000+ apps gets a predictable A-Z list rather than the
 * provider's usage-ranked order. Pure so it's unit-testable.
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
  return filtered.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

/**
 * Split the user's connections into the two grant buckets:
 *
 *  - `granted`   — connected AND in this agent's grant set.
 *  - `available` — connected but NOT granted.
 *
 * The grant unit is the CONNECTED ACCOUNT (`connectionId`), not the toolkit: a
 * user can connect several accounts of one app and grant each independently, so
 * `grants` is a set of granted `connectionId`s. A granted id with no matching
 * connection is ignored (a grant only means something once the account is
 * actually connected). Connection order is preserved within each bucket. Pure
 * so it's unit-testable.
 */
export function splitByGrant(opts: {
  connections: IntegrationConnection[];
  grants: ReadonlySet<string>;
}): { granted: IntegrationConnection[]; available: IntegrationConnection[] } {
  const granted: IntegrationConnection[] = [];
  const available: IntegrationConnection[] = [];
  for (const c of opts.connections) {
    (opts.grants.has(c.connectionId) ? granted : available).push(c);
  }
  return { granted, available };
}

/**
 * Group a flat connection list into per-app buckets keyed by toolkit slug,
 * preserving first-seen order both across toolkits and within each toolkit's
 * accounts. One app card renders per returned entry; multiple accounts of the
 * same app become labeled rows inside it. The caller sorts the result by app
 * display name. Pure so it's unit-testable.
 */
export function groupConnectionsByToolkit(
  connections: IntegrationConnection[],
): { toolkit: string; connections: IntegrationConnection[] }[] {
  const byToolkit = new Map<string, IntegrationConnection[]>();
  for (const c of connections) {
    const bucket = byToolkit.get(c.toolkit);
    if (bucket) bucket.push(c);
    else byToolkit.set(c.toolkit, [c]);
  }
  return [...byToolkit.entries()].map(([toolkit, conns]) => ({
    toolkit,
    connections: conns,
  }));
}

/**
 * The human label for one connected account: the account's own `accountLabel`
 * (an alias the user set, or a derived email/username) when present, else a
 * stable fallback of the localized "unnamed" word plus the last 4 characters of
 * the `connectionId` so two unnamed accounts of one app stay distinguishable.
 * `unnamedLabel` is already localized by the caller. Pure so it's unit-testable.
 */
export function accountDisplayLabel(
  connection: IntegrationConnection,
  unnamedLabel: string,
): string {
  return (
    connection.accountLabel ??
    `${unnamedLabel} ${connection.connectionId.slice(-4)}`
  );
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

/** "developer-tools" -> "Developer tools". */
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
 * it fails, the loop times out, or the flow is cancelled. Pure +
 * dependency-injected so the timeout, wake, and cancellation paths are
 * unit-testable without real timers:
 *
 *  - `poll`        — one connection-status call (already routed through
 *                    `call()`, so a network failure rejects here).
 *  - `sleep`       — the inter-attempt delay. Back it with a `Waker` (below) to
 *                    let `checkNow()` wake the loop before the interval elapses.
 *  - `isCancelled` — read before every wait + poll so cancelling stops the loop
 *                    immediately instead of running out the full budget.
 *
 * Returns `"active"` on success, `"error"` if the OAuth failed or was revoked,
 * `"cancelled"` if the flow was cancelled mid-wait, and `"timeout"` once the
 * attempt budget is spent while still pending.
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

/**
 * A wake-able inter-attempt delay. `wait(ms)` resolves after `ms` OR as soon as
 * `wake()` is called, whichever is first, so the connect flow's "I have
 * finished" button can poll immediately instead of waiting out the interval.
 * The timer is dependency-injected so wake + timeout are unit-testable without
 * real timers.
 */
export interface Waker {
  wait: (ms: number) => Promise<void>;
  wake: () => void;
}

interface WakerTimer {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const REAL_TIMER: WakerTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Build a `Waker`. Pass a fake `timer` in tests to drive wake vs timeout. */
export function createWaker(timer: WakerTimer = REAL_TIMER): Waker {
  let resolveCurrent: (() => void) | null = null;
  let handle: unknown = null;
  const settle = () => {
    if (handle !== null) {
      timer.clear(handle);
      handle = null;
    }
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve?.();
  };
  return {
    wait: (ms) =>
      new Promise<void>((resolve) => {
        resolveCurrent = resolve;
        handle = timer.set(settle, ms);
      }),
    wake: settle,
  };
}
