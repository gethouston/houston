import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  type BoardStatus,
  StreamRegistry,
  type StreamTuning,
  observeConversation as sdkObserveConversation,
  streamTurn as sdkStreamTurn,
} from "@houston/sdk";
import { createBusFeedOutput } from "./feed-output";

export type { StreamTuning } from "@houston/sdk";

/**
 * The web adapter's OWN stream set — module-scoped, so the single adapter keeps
 * exactly one registry (its historical global-singleton behavior) while an SDK
 * instance owns a separate one and the two never cross-abort. Threaded into
 * every SDK turn/observer call below.
 */
const registry = new StreamRegistry();

/** Abort every live conversation stream this adapter owns (WS teardown seam). */
export function disposeAllStreams(): void {
  registry.disposeAll();
}

/**
 * The web adapter's turn entry. The turn/feed machinery lives in `@houston/sdk`
 * now; this drives it with a bus-backed {@link createBusFeedOutput} FeedOutput
 * and keeps the historical `(…, setActivityStatus)` signature shape so app
 * callers and the adapter's unit tests are unchanged. `setActivityStatus` is
 * already bound to this turn's conversation, so the FeedOutput ignores the
 * (agentPath, sessionKey) it re-supplies. `provider` is the chat's composer
 * pick (frontend id) — it labels the typed reconnect card when the runtime
 * refuses the send as not-connected.
 */
export function streamTurn(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  prompt: string,
  setActivityStatus: (status: BoardStatus) => Promise<void>,
  provider?: string,
  tuning?: StreamTuning,
): Promise<void> {
  const output = createBusFeedOutput((_a, _s, status) =>
    setActivityStatus(status),
  );
  return sdkStreamTurn(
    engine,
    agentPath,
    sessionKey,
    prompt,
    output,
    registry,
    {
      provider,
      tuning,
    },
  );
}

/** Passively observe a conversation (see the SDK's `observeConversation`). */
export function observeConversation(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  setActivityStatus: (status: BoardStatus) => Promise<void>,
  messagesAtOpen: number,
  tuning?: StreamTuning,
): void {
  const output = createBusFeedOutput((_a, _s, status) =>
    setActivityStatus(status),
  );
  sdkObserveConversation(
    engine,
    agentPath,
    sessionKey,
    output,
    messagesAtOpen,
    registry,
    tuning,
  );
}
