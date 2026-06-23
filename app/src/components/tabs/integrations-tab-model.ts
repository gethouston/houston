import type { IntegrationLoginResult } from "@houston-ai/engine-client";

/**
 * The provider whose "for you" account this tab signs into. Composio owns the
 * OAuth; we only ever hold a reference to the user's own hosted account.
 */
export const INTEGRATION_PROVIDER = "composio";

/** How long to wait between login polls, and how many times to poll. */
export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_ATTEMPTS = 150; // ~5 min at 2s/attempt.

/**
 * A short list of common apps for one-click connect. Connecting deep-links to
 * Composio's hosted dashboard (it owns the OAuth); the full catalog lives there.
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

/**
 * Outcome of the post-sign-in poll loop. `timeout` is a first-class result, NOT
 * a silent fall-through: the caller MUST surface it so an abandoned browser flow
 * never leaves the user staring at a stopped spinner with no explanation.
 */
export type PollOutcome = "linked" | "timeout" | "cancelled";

/**
 * Poll the provider until the user finishes signing in in their browser, the
 * loop times out, or the user leaves the tab. Pure + dependency-injected so the
 * timeout and cancellation paths are unit-testable without real timers:
 *
 *  - `poll`        — one `pollLogin` call (already routed through `call()`, so a
 *                    network failure rejects here and the caller surfaces it).
 *  - `sleep`       — the inter-attempt delay (real `setTimeout` in prod).
 *  - `isCancelled` — read before every wait + poll so leaving the tab stops the
 *                    loop immediately instead of running out the full 5 minutes.
 *
 * Returns `"linked"` on success, `"cancelled"` if the user left mid-flow, and
 * `"timeout"` once the attempt budget is spent without linking.
 */
export async function pollLoginUntilLinked(deps: {
  poll: () => Promise<IntegrationLoginResult>;
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
    const res = await deps.poll();
    if (res.status === "linked") return "linked";
  }
  return "timeout";
}
