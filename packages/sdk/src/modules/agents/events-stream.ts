/**
 * The global reactivity subscription: a long-lived SSE read of the host's
 * `GET /v1/events`, built on the shared `streamGlobalEvents` loop
 * (`@houston/runtime-client`). This module keeps only the agents-specific
 * seams — header auth via the injected `fetch`, the clock-driven reconnect
 * wait, and `AgentsChanged` translation — and delegates the connect →
 * read → reconnect machinery to the shared helper.
 *
 * On EVERY (re)connect the caller refetches ({@link AgentsStreamHandlers.onConnect}),
 * so any `AgentsChanged` events missed while the stream was down are caught up
 * by the reload — a dropped stream loses no state. `AgentsChanged` frames during
 * a live connection trigger the same refetch. A `401` reports through
 * {@link AgentsStreamHandlers.onUnauthorized} and then backs off; once the host
 * re-attaches a fresh token via the injected `fetch`, the next attempt reconnects.
 */

import { streamGlobalEvents } from "@houston/runtime-client";
import type { Clock, SdkLogger } from "../../ports";
import { AGENTS_CHANGED_EVENT } from "./types";

/** Fixed short reconnect delay, mirroring the shared helper's default. */
const RECONNECT_DELAY_MS = 1500;

export interface AgentsStreamHandlers {
  /** (Re)connected — refetch the list to catch up any events missed while down. */
  onConnect(): void;
  /** An `AgentsChanged` frame arrived on a live connection. */
  onAgentsChanged(): void;
  /** A `401` proved the Houston session token lapsed. */
  onUnauthorized(): void;
}

export interface AgentsStreamDeps {
  baseUrl: string;
  fetch: typeof fetch;
  clock: Clock;
  logger: SdkLogger;
  handlers: AgentsStreamHandlers;
}

/** Start the subscription. Returns a stop function that aborts it for good. */
export function startAgentsEventStream(deps: AgentsStreamDeps): () => void {
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
      logger.debug("agents event stream dropped", { error: String(err) }),
    onEvent: (data) => {
      if (isAgentsChanged(data)) handlers.onAgentsChanged();
    },
  });
  return () => ac.abort();
}

/** Whether a parsed frame is the host's `AgentsChanged` signal. */
function isAgentsChanged(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === AGENTS_CHANGED_EVENT
  );
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
