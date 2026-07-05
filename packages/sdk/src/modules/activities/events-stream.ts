/**
 * The activities reactivity subscription: a long-lived SSE read of the host's
 * `GET /v1/events`, built on the shared `streamGlobalEvents` loop
 * (`@houston/runtime-client`) — the SAME one client-side loop the agents module
 * and the web adapter consume. This module keeps only its own seams: header auth
 * via the injected `fetch`, the clock-driven reconnect wait, and `ActivityChanged`
 * translation (carrying the frame's `agentPath` so the module refetches just
 * that agent).
 *
 * TWO subscriptions per SDK, by design. The agents module opens its own
 * `/v1/events` read for `AgentsChanged`; this one reads `ActivityChanged`.
 * Sharing ONE read would mean folding both filters into a kernel-owned
 * fan-out and refactoring the agents module — out of scope here. The costly
 * piece (the reconnect/read loop) is REUSED via `streamGlobalEvents`; only a
 * second cheap SSE connection is added, mirroring how the web adapter already
 * runs its `subscribeEvents` read alongside the SDK's.
 *
 * On EVERY (re)connect the caller refetches ({@link onConnect}), so events
 * missed while the stream was down are caught up by the reload.
 */

import { streamGlobalEvents } from "@houston/runtime-client";
import type { Clock, SdkLogger } from "../../ports";
import { ACTIVITY_CHANGED_EVENT } from "./types";

/** Fixed short reconnect delay, mirroring the shared helper's default. */
const RECONNECT_DELAY_MS = 1500;

export interface ActivitiesStreamHandlers {
  /** (Re)connected — refetch known agents' activities to catch up missed events. */
  onConnect(): void;
  /**
   * An `ActivityChanged` frame arrived. `agentPath` names the agent whose
   * activities changed (absent on a malformed frame → refetch all known).
   */
  onActivityChanged(agentPath: string | undefined): void;
  /** A `401` proved the Houston session token lapsed. */
  onUnauthorized(): void;
}

export interface ActivitiesStreamDeps {
  baseUrl: string;
  fetch: typeof fetch;
  clock: Clock;
  logger: SdkLogger;
  handlers: ActivitiesStreamHandlers;
}

/** Start the subscription. Returns a stop function that aborts it for good. */
export function startActivitiesEventStream(
  deps: ActivitiesStreamDeps,
): () => void {
  const ac = new AbortController();
  const { clock, logger, handlers } = deps;
  const root = deps.baseUrl.replace(/\/+$/, "");
  void streamGlobalEvents({
    url: () => `${root}/v1/events`,
    fetch: deps.fetch,
    signal: ac.signal,
    delayMs: RECONNECT_DELAY_MS,
    sleep: (ms, signal) => sleep(clock, ms, signal),
    onConnect: () => handlers.onConnect(),
    onUnauthorized: () => handlers.onUnauthorized(),
    onError: (err) =>
      logger.debug("activities event stream dropped", { error: String(err) }),
    onEvent: (data) => {
      const agentPath = activityChangedAgent(data);
      if (agentPath !== null) handlers.onActivityChanged(agentPath);
    },
  });
  return () => ac.abort();
}

/**
 * The agent id off an `ActivityChanged` frame, `undefined` when the frame omits
 * it, or `null` when the frame is not an `ActivityChanged` (not our signal).
 */
function activityChangedAgent(data: unknown): string | undefined | null {
  if (
    typeof data !== "object" ||
    data === null ||
    (data as { type?: unknown }).type !== ACTIVITY_CHANGED_EVENT
  )
    return null;
  const agentPath = (data as { agentPath?: unknown }).agentPath;
  return typeof agentPath === "string" ? agentPath : undefined;
}

/** Backoff sleep on the injected clock, resolved early if the signal aborts. */
function sleep(clock: Clock, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const id = clock.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clock.clearTimeout(id);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
