import type { ModuleContext } from "../../module-context";
import { type FeedOutput, MultiplexFeedOutput } from "./feed-output";
import { type FeedFrame, historyToFeed } from "./history";
import { resolveModelSettings } from "./model-settings";
import { observeConversation } from "./observe-stream";
import { StreamRegistry, streamKey } from "./stream-registry";
import {
  asCancelInput,
  asHistoryInput,
  asObserveInput,
  asSendInput,
  type TurnSendInput,
} from "./turn-inputs";
import { streamTurn, type TurnWirePin } from "./turn-stream";
import { ConversationVmOutput } from "./vm-output";

/**
 * The turns module — the write half of a conversation.
 *
 * It owns a built-in {@link ConversationVmOutput} (the reactive
 * `conversation/<id>` VM) and drives the shared turn machinery through it. Hosts
 * that render turns their own way ATTACH a second output with `addOutput`; the
 * machinery folds each frame once and both outputs see it (via
 * {@link MultiplexFeedOutput}) with no double-processing.
 *
 * `send`/`cancel`/`observe` are the typed facade; the SAME functions back the
 * `turns/send`, `turns/cancel` and `turns/observe` commands, so the bridge path
 * and the in-process path never drift. Payload shapes + validators live in
 * `turn-inputs.ts`.
 */

export function createTurnsModule(ctx: ModuleContext) {
  const vm = new ConversationVmOutput(ctx.store);
  const external = new Set<FeedOutput>();
  // This SDK's own stream set — never a package-global, so a sibling SDK (or the
  // web adapter) can't cross-abort our streams or collide on a shared key.
  const registry = new StreamRegistry();

  /**
   * Start a turn against the agent's sandbox client (`clientFor(agentId)` — the
   * host nests turn/settings routes under `/agents/<id>`). A model/effort pick
   * rides the send as a PER-TURN pin — the model paired with its owning
   * provider (see {@link resolveModelSettings}; the runtime hard-fails a model
   * under the wrong provider). Deliberately NOT a `setSettings` write: a pick
   * for one conversation must never move the agent-wide active provider that
   * every other conversation falls back to (HOU-695). Fires the resumable
   * stream into the composed output; fire-and-forget like the desktop send —
   * progress and settlement flow reactively through the VM.
   */
  const send = async (input: TurnSendInput): Promise<void> => {
    const client = ctx.clientFor(input.agentId ?? "");
    // Resolve the pick's owning provider: it rides the wire pin AND labels the
    // typed reconnect card when the runtime refuses the send as not-connected
    // (the refusal itself can't name a provider — nothing is connected).
    let pin: TurnWirePin | undefined;
    if (
      input.model !== undefined ||
      input.effort !== undefined ||
      input.mode !== undefined
    ) {
      const resolved = await resolveModelSettings(
        client,
        input.model,
        input.effort,
        input.mode,
      );
      pin = {
        provider: resolved.activeProvider,
        model: resolved.model,
        effort: resolved.effort,
        mode: resolved.mode,
      };
    }
    const output = new MultiplexFeedOutput([vm, ...external]);
    void streamTurn(
      client,
      input.agentId ?? "",
      input.conversationId,
      input.text,
      output,
      registry,
      { nonce: input.nonce, provider: pin?.provider, pin },
    );
  };

  /**
   * Passively attach to a conversation with a turn started elsewhere (another
   * client) or before a reload — observer mode. Loads history, folds it, and
   * SEEDS the conversation VM's feed FIRST so a mobile client opening the chat
   * sees the full transcript immediately — THEN attaches {@link
   * observeConversation} into the SAME VM the `send` path uses, so an in-flight
   * turn keeps rendering live. History also seeds the legacy settle guard
   * (`messages.length`). An idle conversation self-closes; a no-op if the
   * conversation is already streamed here — in which case we DON'T re-seed
   * (that live feed already owns the VM), which is the double-render guard.
   */
  const observe = async (
    conversationId: string,
    agentId?: string,
  ): Promise<void> => {
    const client = ctx.clientFor(agentId ?? "");
    const key = streamKey(agentId ?? "", conversationId);
    const { messages } = await client.getHistory(conversationId);
    const output = new MultiplexFeedOutput([vm, ...external]);
    if (!registry.get(key))
      vm.seedHistory(agentId ?? "", conversationId, historyToFeed(messages));
    observeConversation(
      client,
      agentId ?? "",
      conversationId,
      output,
      messages.length,
      registry,
    );
  };

  /**
   * Read-only: fold a conversation's persisted transcript into feed frames (the
   * same fold `observe` seeds the VM with). The `turns/history` command surfaces
   * it to a native shell that wants the transcript without attaching a stream.
   */
  const history = async (
    conversationId: string,
    agentId?: string,
  ): Promise<FeedFrame[]> => {
    const { messages } = await ctx
      .clientFor(agentId ?? "")
      .getHistory(conversationId);
    return historyToFeed(messages);
  };

  /** Abort a conversation's in-flight turn in the agent's sandbox. */
  const cancel = async (
    conversationId: string,
    agentId?: string,
  ): Promise<void> => {
    await ctx.clientFor(agentId ?? "").cancel(conversationId);
  };

  ctx.registerCommand("turns/send", (payload) => send(asSendInput(payload)));
  ctx.registerCommand("turns/cancel", (payload) => {
    const { conversationId, agentId } = asCancelInput(payload);
    return cancel(conversationId, agentId);
  });
  ctx.registerCommand("turns/observe", (payload) => {
    const { conversationId, agentId } = asObserveInput(payload);
    return observe(conversationId, agentId);
  });
  ctx.registerCommand("turns/history", (payload) => {
    const { conversationId, agentId } = asHistoryInput(payload);
    return history(conversationId, agentId);
  });

  return {
    send,
    cancel,
    observe,
    history,
    /**
     * Attach an extra {@link FeedOutput} that every subsequent turn also drives
     * (e.g. a host UI bus). Returns a detach function.
     */
    addOutput(output: FeedOutput): () => void {
      external.add(output);
      return () => {
        external.delete(output);
      };
    },
    /** Abort every live turn/observer stream this module owns (SDK teardown). */
    dispose(): void {
      registry.disposeAll();
    },
  };
}

export {
  type BoardStatus,
  type FeedOutput,
  MultiplexFeedOutput,
  type PendingInteraction,
  type SessionStatusValue,
  type TerminalBoardStatus,
} from "./feed-output";
export { type FeedFrame, historyToFeed } from "./history";
export { observeConversation } from "./observe-stream";
export { TURN_DIED_MESSAGE } from "./settle-from-history";
export {
  SEND_IN_FLIGHT_MESSAGE,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  StreamRegistry,
  type StreamTuning,
  streamKey,
} from "./stream-registry";
export {
  isNotConnectedError,
  isStoppedByUser,
  TURN_FAILED_MESSAGE,
  turnErrorMessage,
} from "./turn-errors";
export type {
  TurnCancelInput,
  TurnHistoryInput,
  TurnObserveInput,
  TurnSendInput,
} from "./turn-inputs";
export {
  type StreamTurnOptions,
  streamTurn,
  type TurnWirePin,
} from "./turn-stream";
export {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
  type FeedItemVM,
  type QueuedMessageVM,
} from "./vm-output";
