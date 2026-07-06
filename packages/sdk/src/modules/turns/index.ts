import type { ModuleContext } from "../../module-context";
import {
  ActivityStatusOutput,
  type BoardStatusPersister,
} from "./activity-status-output";
import type { FeedOutput } from "./feed-output";
import { createTurnOperations } from "./operations";
import { StreamRegistry } from "./stream-registry";
import {
  asCancelInput,
  asHistoryInput,
  asObserveInput,
  asSendInput,
} from "./turn-inputs";
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

export function createTurnsModule(
  ctx: ModuleContext,
  persistBoardStatus: BoardStatusPersister,
) {
  const vm = new ConversationVmOutput(ctx.store);
  // The always-on outputs every turn drives: the conversation VM, plus a board-
  // card persister (the SDK-path counterpart to the web adapter's bus output) so
  // a native shell that never calls `addOutput` still leaves a settled mission
  // out of "running".
  const activityStatus = new ActivityStatusOutput(
    persistBoardStatus,
    ctx.config.ports.logger,
  );
  const defaults: readonly FeedOutput[] = [vm, activityStatus];
  const external = new Set<FeedOutput>();
  // This SDK's own stream set — never a package-global, so a sibling SDK (or the
  // web adapter) can't cross-abort our streams or collide on a shared key.
  const registry = new StreamRegistry();

  const { send, observe, history, cancel } = createTurnOperations(ctx, {
    vm,
    defaults,
    external,
    registry,
  });

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
