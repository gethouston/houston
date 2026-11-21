import type {
  ConversationImportRequest,
  ConversationImportResult,
} from "@houston/protocol";
import type { ModuleContext } from "../../module-context";
import { classifyImportFailure } from "./conversation-import-abort";
import { createConversationImportHold } from "./conversation-import-hold";
import {
  createConversationImportOutbox,
  type PendingConversationImport,
} from "./conversation-import-outbox";
import { asAgentInput, asImportInput } from "./turn-inputs";

export interface ConversationImportRef {
  agentId: string;
  conversationId: string;
  importId: string;
}

export interface ConversationImportRetry {
  landed: (ConversationImportRef & { imported: number })[];
  failures: (ConversationImportRef & { error: unknown })[];
}

export function createConversationImports(ctx: ModuleContext) {
  const outbox = createConversationImportOutbox(ctx);
  const send = (entry: PendingConversationImport) =>
    ctx
      .clientFor(entry.agentId)
      .importMessages(entry.conversationId, entry.request);
  const lifecycle = ctx.config.ports.pageLifecycle;
  const holds = lifecycle
    ? createConversationImportHold(
        lifecycle,
        ctx.config.ports.clock,
        ctx.config.ports.logger,
        send,
        outbox.settle,
      )
    : null;

  /**
   * Writes lines said somewhere else into a chat as its real history.
   *
   * No turn runs. The lines land after everything already in the chat, in
   * order, and the next turn carries them to the model as earlier context.
   * The import is written down on this device before it is sent, so one that
   * fails is sent again by retryPendingImports; `importId` names it, and an
   * import that already landed writes nothing (`imported: 0`). Answers 409
   * while a turn holds the chat. An import the PAGE abandoned (the browser
   * aborted it because the document was leaving) is held, not failed: the
   * promise settles once the page is live again and the import was sent
   * again, and a page that really left never settles it (the import is still
   * owed; the next load sends it).
   * @param conversationId The chat the lines go into.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @param request `importId` (lowercase letters, digits, `:`, `_`, `-`) and
   *   the `messages`, each `{ role: "user" | "assistant", content }`.
   * @assistant group:chat
   * @assistant hidden: it writes lines into a chat as though they had been said there; only the surface that held that conversation knows what was said, so anything else writing them would forge the person's history.
   */
  const importMessages = async (
    conversationId: string,
    agentId: string,
    request: ConversationImportRequest,
  ): Promise<ConversationImportResult> => {
    const entry = { agentId, conversationId, request };
    const joined = holds?.pending(entry);
    if (joined) return joined;
    await outbox.owe(entry);
    let result: ConversationImportResult;
    try {
      result = await ctx
        .clientFor(agentId)
        .importMessages(conversationId, request);
    } catch (err) {
      await outbox.settle(entry, err);
      if (
        holds &&
        lifecycle &&
        classifyImportFailure(err, lifecycle.isUnloading()) === "aborted"
      )
        return holds.hold(entry);
      throw err;
    }
    await outbox.settle(entry);
    return result;
  };

  const retryPendingImports = async (
    agentId: string,
  ): Promise<ConversationImportRetry> => {
    const outcome: ConversationImportRetry = { landed: [], failures: [] };
    const owed = await outbox.owed();
    for (const entry of owed.filter((e) => e.agentId === agentId)) {
      const ref: ConversationImportRef = {
        agentId: entry.agentId,
        conversationId: entry.conversationId,
        importId: entry.request.importId,
      };
      try {
        const { imported } = await importMessages(
          entry.conversationId,
          entry.agentId,
          entry.request,
        );
        outcome.landed.push({ ...ref, imported });
      } catch (error) {
        outcome.failures.push({ ...ref, error });
      }
    }
    return outcome;
  };

  ctx.registerCommand("turns/importMessages", (payload) => {
    const input = asImportInput(payload);
    return importMessages(input.conversationId, input.agentId, input.request);
  });
  ctx.registerCommand("turns/retryPendingImports", (payload) =>
    retryPendingImports(asAgentInput(payload, "turns/retryPendingImports")),
  );

  return { importMessages, retryPendingImports };
}
