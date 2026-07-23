import type { ModuleContext } from "../../module-context";
import {
  ActivityStatusOutput,
  type BoardStatusPersister,
} from "./activity-status-output";
import {
  asAttachmentsSaveInput,
  createAttachmentsOperation,
} from "./attachments";
import { startTurnsEventStream } from "./events-stream";
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
  const vm = new ConversationVmOutput(ctx.store, {
    cacheMax: ctx.config.conversationCacheMax,
  });
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

  const operations = createTurnOperations(ctx, {
    vm,
    defaults,
    external,
    registry,
  });
  const { send, observe, history, cancel } = operations;
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
  DEFAULT_CONVERSATION_CACHE_MAX,
  type FeedItemVM,
  type HistoryWindowVM,
  type QueuedMessageVM,
} from "./vm-output";
