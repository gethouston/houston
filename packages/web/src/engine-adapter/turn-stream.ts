import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  type BoardStatus,
  conversationScope,
  type FeedFrame,
  type HistoryWindowVM,
  MultiplexFeedOutput,
  type PendingInteraction,
  StreamRegistry,
  type StreamTuning,
  observeConversation as sdkObserveConversation,
  streamTurn as sdkStreamTurn,
  streamKey,
  type TurnWirePin,
} from "@houston/sdk";
import { cachePersistOutput } from "./cache-persist";
import { createBusFeedOutput } from "./feed-output";
import { decideServerSeed, type SeedFrame } from "./history-window";
import { conversationStore, conversationVm } from "./vm";

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
 * Every stream folds into ALL halves: the conversation VM (the app's one
 * turn-state source, read via `useSdkSnapshot`), the legacy event bus
 * (which still drives query invalidation and notifications — events, not
 * state), and the settle-time local-cache persist (order matters: the VM
 * folds first so the cache snapshots a settled feed).
 */
function composedOutput(
  setActivityStatus: (
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
  ) => Promise<void>,
) {
  return new MultiplexFeedOutput([
    conversationVm,
    createBusFeedOutput((_a, _s, status, pendingInteraction) =>
      setActivityStatus(status, pendingInteraction),
    ),
    cachePersistOutput(),
  ]);
}

/**
 * Seed the conversation VM from a loaded history fold — unless a live turn or
 * observer already owns the conversation (that stream's feed IS the VM;
 * re-seeding would clobber its in-flight bubble), or the VM already holds a
 * feed the fold would make poorer. The guard is what makes a RACED history
 * read harmless: a load fired mid-turn can resolve just after settle (the
 * registry entry already released) carrying a fold persisted BEFORE the reply
 * — replacing the settled live feed with it would eat the reply.
 *
 * Two seed shapes (HOU-819):
 * - Cache paint (no `window`): the historical richer-wins length guard — the
 *   paint only ever fills an emptier VM.
 * - Windowed server read (`window` set): the fold is a TAIL, so it can be
 *   shorter than the feed yet strictly newer (a teammate's turn landed while
 *   this chat was closed and cache-painted) — {@link decideServerSeed}
 *   anchors on user-message content (never cross-clock timestamps), replaces
 *   on newer/richer, stamps the window without reseeding on identical
 *   content, and skips on poorer (or when the feed holds loaded pages /
 *   unconfirmed sends the fold lacks).
 */
export function seedConversationVm(
  agentPath: string,
  sessionKey: string,
  frames: FeedFrame[],
  window?: HistoryWindowVM,
): void {
  if (registry.get(streamKey(agentPath, sessionKey))) return;
  const current = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as { feed?: SeedFrame[]; historyWindow?: HistoryWindowVM } | undefined;
  const curFeed = current?.feed ?? [];
  if (!window) {
    if (curFeed.length >= frames.length) return;
    conversationVm.seedHistory(agentPath, sessionKey, frames);
    return;
  }
  const decision = decideServerSeed(
    curFeed,
    frames,
    current?.historyWindow !== undefined,
  );
  if (decision === "replace") {
    conversationVm.seedHistory(agentPath, sessionKey, frames, window);
  } else if (decision === "stamp") {
    conversationVm.stampHistoryWindow(agentPath, sessionKey, window);
  }
}

/**
 * Show a user's message in the conversation VM BEFORE any turn exists — the
 * warming-engine send queue (HOU-693): the message is held client-side until
 * the just-created agent's engine answers, but the user must see it as sent
 * immediately. The eventual real send goes out with `suppressUserBubble` so
 * the bubble is never doubled.
 */
export function pushPendingUserMessage(
  agentPath: string,
  sessionKey: string,
  text: string,
): void {
  conversationVm.pushFeedItem(agentPath, sessionKey, {
    feed_type: "user_message",
    data: text,
  });
}

/**
 * The web adapter's turn entry. The turn/feed machinery lives in `@houston/sdk`
 * now; this drives it with a bus-backed {@link createBusFeedOutput} FeedOutput
 * and keeps the historical `(…, setActivityStatus)` signature shape so app
 * callers and the adapter's unit tests are unchanged. `setActivityStatus` is
 * already bound to this turn's conversation, so the FeedOutput ignores the
 * (agentPath, sessionKey) it re-supplies. `provider` is the chat's composer
 * pick (frontend id) — it labels the typed reconnect card when the runtime
 * refuses the send as not-connected. `pin` is the same pick in ENGINE ids,
 * sent on the wire so the turn runs on the conversation's own provider/model
 * instead of the agent-wide settings (HOU-695) — see `wireTurnPin`.
 */
export function streamTurn(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  prompt: string,
  setActivityStatus: (
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
  ) => Promise<void>,
  provider?: string,
  tuning?: StreamTuning,
  suppressUserBubble?: boolean,
  pin?: TurnWirePin,
  displayText?: string,
): Promise<void> {
  return sdkStreamTurn(
    engine,
    agentPath,
    sessionKey,
    prompt,
    composedOutput(setActivityStatus),
    registry,
    {
      provider,
      tuning,
      suppressUserBubble,
      pin,
      displayText,
    },
  );
}

/** Passively observe a conversation (see the SDK's `observeConversation`). */
export function observeConversation(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  setActivityStatus: (
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
  ) => Promise<void>,
  messagesAtOpen: number,
  tuning?: StreamTuning,
): void {
  sdkObserveConversation(
    engine,
    agentPath,
    sessionKey,
    composedOutput(setActivityStatus),
    messagesAtOpen,
    registry,
    tuning,
  );
}
