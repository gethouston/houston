import { historyToFeed as sdkHistoryToFeed } from "@houston/sdk";
import type {
  ConversationImportRequest,
  ConversationImportResult,
} from "@houston/wire-types";
import {
  historyReadMark,
  ownTurnHolds,
  seedConversationVm,
} from "../conversation-seed";
import { CHAT_OPEN_WINDOW } from "../history-window";
import { DEFAULT_AGENT_PATH } from "../synthetic";
import { runtimeScope } from "./chat-scope";
import type { AdapterContext } from "./context";
import { toHoustonEngineError, viaSdk } from "./sdk-error";

const importPath = (agentPath: string, conversationId: string): string =>
  `/agents/${encodeURIComponent(agentPath)}/conversations/${encodeURIComponent(conversationId)}/import`;

async function reseed(
  ctx: AdapterContext,
  agentPath: string,
  conversationId: string,
): Promise<void> {
  if (ownTurnHolds(agentPath, conversationId)) return;
  const mark = historyReadMark(agentPath, conversationId);
  const history = await ctx.sdk
    .clientFor(runtimeScope(ctx, agentPath))
    .getHistory(conversationId, { limit: CHAT_OPEN_WINDOW });
  seedConversationVm(
    agentPath,
    conversationId,
    sdkHistoryToFeed(history.messages),
    mark,
    {
      earliestLoaded: history.offset ?? 0,
      total: history.totalMessages ?? history.messages.length,
    },
  );
}

export async function importConversation(
  ctx: AdapterContext,
  agentPath: string,
  conversationId: string,
  request: ConversationImportRequest,
): Promise<ConversationImportResult> {
  const path = agentPath || DEFAULT_AGENT_PATH;
  const result = await viaSdk(importPath(path, conversationId), () =>
    ctx.sdk.turns.importMessages(
      conversationId,
      runtimeScope(ctx, path),
      request,
    ),
  );
  if (result.imported > 0) await reseed(ctx, path, conversationId);
  return result;
}

export async function retryPendingImports(
  ctx: AdapterContext,
  agentPath: string,
): Promise<unknown[]> {
  const { landed, failures } = await ctx.sdk.turns.retryPendingImports(
    runtimeScope(ctx, agentPath || DEFAULT_AGENT_PATH),
  );
  for (const entry of landed) {
    if (entry.imported === 0 || entry.agentId === "") continue;
    await reseed(ctx, entry.agentId, entry.conversationId);
  }
  return failures.map((failure) =>
    toHoustonEngineError(
      failure.error,
      importPath(failure.agentId, failure.conversationId),
    ),
  );
}
