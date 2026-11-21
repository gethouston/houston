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

export function createTurnsModule(
  ctx: ModuleContext,
  persistBoardStatus: BoardStatusPersister,
) {
  const vm = new ConversationVmOutput(ctx.store, {
    cacheMax: ctx.config.conversationCacheMax,
  });
  const activityStatus = new ActivityStatusOutput(
    persistBoardStatus,
    ctx.config.ports.logger,
  );
  const defaults: readonly FeedOutput[] = [vm, activityStatus];
  const external = new Set<FeedOutput>();
  const registry = new StreamRegistry();

  const operations = createTurnOperations(ctx, {
    vm,
    defaults,
    external,
    registry,
  });
  const { send, observe, history } = operations;
  const controls = createConversationControls(ctx, registry);
  const clock = ctx.config.ports.clock;
  const drafts = new DraftPrewarm({
    prewarm: controls.prewarm,
    now: () => clock.now(),
    monotonic: () => clock.monotonic?.() ?? clock.now(),
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
    saveAttachments: attachments.save,
    draftChanged: (
      draft: ComposerDraft,
      capabilities: PrewarmCapabilities,
    ): Promise<void> => drafts.draftChanged(draft, capabilities),
    claimNewConversationId: (draftKey: string): string =>
      drafts.claimNewConversationId(draftKey),
    typingState: (): DraftPrewarmState => drafts.state(),
    adoptTypingState: (state: DraftPrewarmState): void => drafts.adopt(state),
    forget(conversationId: string, agentId?: string): void {
      vm.forget(agentId ?? "", conversationId);
      operations.forgetObserved(conversationId, agentId);
    },
    addOutput(output: FeedOutput): () => void {
      external.add(output);
      return () => {
        external.delete(output);
      };
    },
    dispose(): void {
      stopEvents();
      registry.disposeAll();
    },
  };
}

export * from "./public-exports";
