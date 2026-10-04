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
import {
  type ComposerDraft,
  DraftPrewarm,
  type DraftPrewarmState,
  type PrewarmCapabilities,
} from "./draft-prewarm";
import { startTurnsEventStream } from "./events-stream";
import type { FeedOutput } from "./feed-output";
import { createTurnOperations } from "./operations";
import { randomNonce } from "./random-nonce";
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
  // The one-shot conversation controls (stop / mode / dismiss / rewind /
  // prewarm) register their own commands; they share the module's context and
  // nothing else.
  const controls = createConversationControls(ctx);
  // Per instance like the stream registry: typing sessions and the ids minted
  // for new chats belong to this SDK's composers alone.
  const drafts = new DraftPrewarm({
    prewarm: controls.prewarm,
    now: () => ctx.config.ports.clock.now(),
    mintId: randomNonce,
  });
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
     * A composer's text changed: prewarm the sandbox its send will run in,
     * when the deployment serves it and the typing policy says it is due
     * (`draft-prewarm.ts`). Rejects with the prewarm's own error so the
     * surface reports it; nothing is shown to the person either way.
     */
    draftChanged: (
      draft: ComposerDraft,
      capabilities: PrewarmCapabilities,
    ): Promise<void> => drafts.draftChanged(draft, capabilities),
    /**
     * The conversation id a new chat's first send must use: the one typing in
     * the `draftKey` slot already prewarmed, else a fresh one. Never throws.
     */
    claimNewConversationId: (draftKey: string): string =>
      drafts.claimNewConversationId(draftKey),
    /** The composers' typing state, for a replacement SDK to adopt. */
    typingState: (): DraftPrewarmState => drafts.state(),
    /** Take over the typing state of the SDK this one replaces. */
    adoptTypingState: (state: DraftPrewarmState): void => drafts.adopt(state),
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

// The module's public surface beyond `createTurnsModule`, re-exported from
// one list so this file stays the module's wiring alone.
export * from "./public-exports";
