import type { TurnMode } from "@houston/protocol";
import type { ResolvedModel } from "../backends/types";
import { conversationCompactions } from "../store/conversation-compaction";
import { serverBackendFor } from "./conversation-backends";
import type { Conversation } from "./conversation-record";
import { openConversationSession } from "./open-conversation-session";

const ANTHROPIC_BACKEND_ID = "anthropic";

export async function switchBackendIfNeeded(
  conv: Conversation,
  conversationId: string,
  model: ResolvedModel,
  mode: TurnMode,
  nextStepSuggestions = true,
  timezone?: string,
): Promise<{ rebuilt: boolean; preTokens: number | null }> {
  const backend = serverBackendFor(model.provider);
  if (backend.id === conv.backendId) return { rebuilt: false, preTokens: null };

  if (conv.backendId === ANTHROPIC_BACKEND_ID)
    conversationCompactions.clear(conversationId);

  const preTokens = conv.session.getContextUsage()?.tokens ?? null;
  conv.session.dispose();
  conv.session = await openConversationSession(backend, {
    conversationId,
    model,
    mode,
    nextStepSuggestions,
    timezone,
    fresh: true,
    ...(conv.context ? { context: conv.context } : {}),
  });
  conv.backendId = backend.id;
  conv.provider = model.provider;
  conv.model = model.id;
  conv.mode = mode;
  conv.nextStepSuggestions = nextStepSuggestions;
  conv.timezone = timezone;
  return { rebuilt: true, preTokens };
}

export async function switchModeIfNeeded(
  conv: Conversation,
  conversationId: string,
  model: ResolvedModel,
  mode: TurnMode,
  nextStepSuggestions = true,
  timezone?: string,
): Promise<{ rebuilt: boolean }> {
  if (
    conv.mode === mode &&
    (conv.nextStepSuggestions ?? true) === nextStepSuggestions &&
    conv.timezone === timezone
  )
    return { rebuilt: false };
  conv.session.dispose();
  conv.session = await openConversationSession(
    serverBackendFor(model.provider),
    {
      conversationId,
      model,
      mode,
      nextStepSuggestions,
      timezone,
      ...(conv.context ? { context: conv.context } : {}),
    },
  );
  conv.mode = mode;
  conv.nextStepSuggestions = nextStepSuggestions;
  conv.timezone = timezone;
  return { rebuilt: true };
}
