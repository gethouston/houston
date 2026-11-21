import { streamGlobalEvents } from "@houston/runtime-client";
import { trimTrailingSlashes } from "@houston/runtime-client/trim-slashes";
import type { Clock, SdkLogger } from "../../ports";

const CONVERSATIONS_CHANGED_EVENT = "ConversationsChanged";
const RECONNECT_DELAY_MS = 1500;

export interface TurnsStreamHandlers {
  onConnect(): void;
  onConversationsChanged(agentPath: string | undefined): void;
  onUnauthorized(): void;
}

export interface TurnsStreamDeps {
  baseUrl: string;
  fetch: typeof fetch;
  clock: Clock;
  logger: SdkLogger;
  handlers: TurnsStreamHandlers;
}

export function startTurnsEventStream(deps: TurnsStreamDeps): () => void {
  const ac = new AbortController();
  const { clock, logger, handlers } = deps;
  const root = trimTrailingSlashes(deps.baseUrl);
  void streamGlobalEvents({
    url: () => `${root}/v1/events`,
    fetch: deps.fetch,
    signal: ac.signal,
    delayMs: RECONNECT_DELAY_MS,
    sleep: (ms, signal) => sleep(clock, ms, signal),
    onConnect: handlers.onConnect,
    onUnauthorized: handlers.onUnauthorized,
    onError: (err) =>
      logger.debug("turns event stream dropped", { error: String(err) }),
    onEvent: (data) => {
      const agentPath = conversationsChangedAgent(data);
      if (agentPath !== null) handlers.onConversationsChanged(agentPath);
    },
  });
  return () => ac.abort();
}

function conversationsChangedAgent(data: unknown): string | undefined | null {
  if (
    typeof data !== "object" ||
    data === null ||
    (data as { type?: unknown }).type !== CONVERSATIONS_CHANGED_EVENT
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
