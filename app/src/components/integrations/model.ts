import type {
  Capabilities,
  IntegrationConnection,
} from "@houston-ai/engine-client";

/**
 * The integrations provider (platform mode): Houston holds the platform key
 * server-side; the user only OAuths the apps themselves, no Composio account,
 * no sign-in step for the apps.
 */
export const INTEGRATION_PROVIDER = "composio";

/**
 * Whether this deployment serves the integration routes at all. The host
 * advertises the providers actually wired in `/v1/capabilities` — a deployment
 * with neither a gateway URL nor a platform key honestly serves `[]` and
 * answers every `/v1/integrations` route with 503 ("integrations not
 * configured"), so callers must not fetch there. `null` capabilities (still
 * loading, or the legacy Rust engine, which has no integration routes) also
 * means don't fetch. Pure so it's unit-testable.
 */
/**
 * The provider a single-provider surface should manage: the platform provider
 * ("composio") when the engine wires it, else the FIRST provider it does wire
 * (an MCP app hub) — so cloud and hub-only local render the SAME UI. Undefined
 * only when integrations are off entirely.
 */
export function activeIntegration<T extends { provider: string }>(
  items: T[] | undefined,
): T | undefined {
  if (!items || items.length === 0) return undefined;
  return (
    items.find((i) => i.provider === INTEGRATION_PROVIDER) ??
    // The key-free custom provider is ALWAYS registered and has its own
    // section — it must never become the page's primary provider.
    items.find((i) => i.provider !== "custom")
  );
}

export function integrationsSupported(
  capabilities: Pick<Capabilities, "integrations"> | null,
): boolean {
  return (capabilities?.integrations.length ?? 0) > 0;
}

/** How long to wait between connection polls, and how many times to poll. */
export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_ATTEMPTS = 150; // ~5 min at 2s/attempt.

/**
 * Split the user's connections into the two grant buckets:
 *
 *  - `granted`   — connected AND in this agent's grant set.
 *  - `available` — connected but NOT granted.
 *
 * A grant slug with no matching connection is ignored (a grant only means
 * something once the app is actually connected). Connection order is preserved
 * within each bucket. Pure so it's unit-testable.
 */
export function splitByGrant(opts: {
  connections: IntegrationConnection[];
  grants: ReadonlySet<string>;
}): { granted: IntegrationConnection[]; available: IntegrationConnection[] } {
  const granted: IntegrationConnection[] = [];
  const available: IntegrationConnection[] = [];
  for (const c of opts.connections) {
    (opts.grants.has(c.toolkit) ? granted : available).push(c);
  }
  return { granted, available };
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
