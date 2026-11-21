import { streamGlobalEvents } from "@houston/runtime-client";
import { trimTrailingSlashes } from "@houston/runtime-client/trim-slashes";
import type { Clock, SdkLogger } from "../../ports";
import { AGENT_ROLE_CHANGED_EVENT, AGENTS_CHANGED_EVENT } from "./types";

const RECONNECT_DELAY_MS = 1500;

export interface AgentsStreamHandlers {
  onConnect(): void;
  onAgentsChanged(): void;
  onUnauthorized(): void;
}

export interface AgentsStreamDeps {
  baseUrl: string;
  fetch: typeof fetch;
  clock: Clock;
  logger: SdkLogger;
  handlers: AgentsStreamHandlers;
}

export function startAgentsEventStream(deps: AgentsStreamDeps): () => void {
  const ac = new AbortController();
  const { clock, logger, handlers } = deps;
  const root = trimTrailingSlashes(deps.baseUrl);
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
      if (changesTheList(data)) handlers.onAgentsChanged();
    },
  });
  return () => ac.abort();
}

function changesTheList(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const { type } = data as { type?: unknown };
  return (
    type === AGENTS_CHANGED_EVENT ||
    type === AGENT_ROLE_CHANGED_EVENT ||
    type === "PreferencesChanged"
  );
}

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
