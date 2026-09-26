import type { ModuleContext } from "../../module-context";
import {
  ActivityStatusOutput,
  type BoardStatusPersister,
} from "./activity-status-output";
import {
  asAttachmentsSaveInput,
  createAttachmentsOperation,
} from "./attachments";
import { createConversationControls } from "./conversation-controls";
import { startTurnsEventStream } from "./events-stream";
import type { FeedOutput } from "./feed-output";
import { createTurnOperations } from "./operations";
import { StreamRegistry } from "./stream-registry";
import { asConversationInput, asSendInput } from "./turn-inputs";
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
 * `turns/send`, `turns/cancel` and `turns/observe` commands, so the dispatch
 * path and the in-process path never drift. Payload shapes + validators live in
 * `turn-inputs.ts`.
 */

export function createTurnsModule(
  ctx: ModuleContext,
  persistBoardStatus: BoardStatusPersister,
) {
  const vm = new ConversationVmOutput(ctx.store, {
    cacheMax: ctx.config.conversationCacheMax,
  });
  // The always-on outputs every turn drives: the conversation VM, plus a board-
  // card persister (the SDK-path counterpart to the web adapter's bus output) so
  // a binder that never calls `addOutput` still leaves a settled mission out of
  // "running".
  const activityStatus = new ActivityStatusOutput(
    persistBoardStatus,
    ctx.config.ports.logger,
  );
  const defaults: readonly FeedOutput[] = [vm, activityStatus];
  const external = new Set<FeedOutput>();
  // This SDK's own stream set — never a package-global, so a sibling SDK (or the
  // web adapter) can't cross-abort our streams or collide on a shared key.
  const registry = new StreamRegistry();

  const operations = createTurnOperations(ctx, {
    vm,
    defaults,
    external,
    registry,
  });
  const { send, observe, history } = operations;
  // The one-shot conversation controls (stop / mode / dismiss / rewind) register
  // their own commands; they share the module's client cache and nothing else.
  const controls = createConversationControls(ctx);
  const attachments = createAttachmentsOperation(ctx);
  const stopEvents =
    ctx.config.reactivity === false
      ? () => {}
      : startTurnsEventStream({
          baseUrl: ctx.config.baseUrl,
          ...ctx.config.ports,
          handlers: {
            onConnect: () => operations.refreshObserved(),
            onConversationsChanged: operations.refreshObserved,
            onUnauthorized: () => ctx.authExpiry.notifyExpired(),
          },
        });

  ctx.registerCommand("turns/send", (payload) => send(asSendInput(payload)));
  ctx.registerCommand("turns/attachments/save", (payload) =>
    attachments.save(asAttachmentsSaveInput(payload)),
  );
  ctx.registerCommand("turns/observe", (payload) => {
    const ref = asConversationInput(payload, "turns/observe");
    return observe(ref.conversationId, ref.agentId);
  });
  ctx.registerCommand("turns/history", (payload) => {
    const ref = asConversationInput(payload, "turns/history");
    return history(ref.conversationId, ref.agentId);
  });

  return {
    send,
    ...controls,
    observe,
    history,
    /**
     * Upload composer attachments into the agent's workspace, returning the
     * relative paths the agent's Read tool opens. Backs the
     * `turns/attachments/save` command; weave the paths into the turn text with
     * {@link buildAttachmentText}.
     */
    saveAttachments: attachments.save,
    /**
     * Drop a conversation's folded transcript from the in-memory VM cache (and
     * its retained snapshot) — call when a surface closes or deletes a
     * conversation so its memory is released at once. Re-hydrates from history on
     * the next {@link observe}. Idle conversations are also evicted automatically
     * by the LRU bound; this is the explicit seam for a known-done conversation.
     */
    forget(conversationId: string, agentId?: string): void {
      vm.forget(agentId ?? "", conversationId);
      operations.forgetObserved(conversationId, agentId);
    },
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
      stopEvents();
      registry.disposeAll();
    },
  };
}

export {
  type AttachmentRef,
  buildAttachmentText,
  type DecodedAttachmentText,
  decodeAttachmentText,
} from "./attachment-text";
export {
  type AttachmentsOperation,
  AttachmentTooLargeError,
  type AttachmentUpload,
  asAttachmentsSaveInput,
  createAttachmentsOperation,
  type TurnAttachmentsSaveInput,
  type TurnAttachmentsSaveResult,
} from "./attachments";
export type { DismissInteractionOutcome } from "./conversation-controls";
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
  ENGINE_RESTART_MESSAGE,
  ENGINE_RESUMED_MESSAGE,
  type EngineNoticeKind,
  isEngineWakingRejection,
  isNotConnectedError,
  isStoppedByUser,
  isTurnRunningRejection,
  messageLimitRefusal,
  TURN_FAILED_MESSAGE,
  turnErrorMessage,
} from "./turn-errors";
export type {
  TurnConversationInput,
  TurnSendInput,
  TurnSetModeInput,
  TurnTruncateInput,
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
  DEFAULT_CONVERSATION_CACHE_MAX,
  type FeedAuthor,
  type FeedItemVM,
  type FeedMention,
  type HistoryWindowVM,
  type QueuedMessageVM,
} from "./vm-output";
