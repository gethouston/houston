import { streamGlobalEvents } from "@houston/runtime-client";
import { trimTrailingSlashes } from "@houston/runtime-client/trim-slashes";
import type { Clock, SdkLogger } from "../../ports";
import { ACTIVITY_CHANGED_EVENT } from "./types";

const RECONNECT_DELAY_MS = 1500;

export interface ActivitiesStreamHandlers {
  onConnect(): void;
  onActivityChanged(agentPath: string | undefined): void;
  onUnauthorized(): void;
}

export interface ActivitiesStreamDeps {
  baseUrl: string;
  fetch: typeof fetch;
  clock: Clock;
  logger: SdkLogger;
  handlers: ActivitiesStreamHandlers;
}

export function startActivitiesEventStream(
  deps: ActivitiesStreamDeps,
): () => void {
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
      logger.debug("activities event stream dropped", { error: String(err) }),
    onEvent: (data) => {
      const agentPath = activityChangedAgent(data);
      if (agentPath !== null) handlers.onActivityChanged(agentPath);
    },
  });
  return () => ac.abort();
}

export interface ActivitiesReactivityDeps {
  baseUrl: string;
  fetch: typeof fetch;
  clock: Clock;
  logger: SdkLogger;
  known: ReadonlySet<string>;
  refresh(agentId: string): Promise<void>;
  onUnauthorized(): void;
}

export function attachActivitiesReactivity(
  deps: ActivitiesReactivityDeps,
): () => void {
  const backgroundRefresh = (agentId: string, where: string) =>
    void deps.refresh(agentId).catch((err) =>
      deps.logger.debug(`activities refresh (${where}) failed`, {
        error: String(err),
        agentId,
      }),
    );
  const refreshAll = (where: string) => {
    for (const id of deps.known) backgroundRefresh(id, where);
  };
  return startActivitiesEventStream({
    baseUrl: deps.baseUrl,
    fetch: deps.fetch,
    clock: deps.clock,
    logger: deps.logger,
    handlers: {
      onConnect: () => refreshAll("connect"),
      onActivityChanged: (agentPath) => {
        if (agentPath === undefined) refreshAll("change");
        else if (deps.known.has(agentPath))
          backgroundRefresh(agentPath, "change");
      },
      onUnauthorized: deps.onUnauthorized,
    },
  });
}

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
