import type {
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireFrame,
} from "@houston/runtime-client";
import {
  classifyProviderError,
  ModelNotOfferedError,
} from "../ai/provider-error";
import { logProviderError } from "../ai/provider-error-log";
import { noteAuthFailure, noteQuotaExhausted } from "../auth/credential-health";
import { reportRevokedServedToken } from "../auth/report-revoked";
import type { newUsedTokenCapture } from "../auth/used-token";
import { appendAssistantMessageAt } from "../store/conversation-file";
import { TurnBackendProviderError } from "./turn-backend";
import type { TurnOutcome } from "./turn-session-types";

/** Classify and persist a thrown session failure. */
export function handleTurnSessionFailure(input: {
  error: unknown;
  signal?: AbortSignal;
  providerError?: ProviderError;
  assistantText: string;
  tools: ToolCallRecord[];
  usage: TokenUsage | null;
  conversationsDir: string;
  conversationId: string;
  turnId: string;
  provider: string;
  model?: string | null;
  text: string;
  usedTokens: ReturnType<typeof newUsedTokenCapture>;
  emit: (frame: WireFrame) => void;
}): TurnOutcome {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  if (
    !input.providerError &&
    (input.signal?.aborted ||
      (input.error instanceof Error && input.error.name === "AbortError"))
  ) {
    if (input.assistantText)
      appendAssistantMessageAt(
        input.conversationsDir,
        input.conversationId,
        input.assistantText,
        { tools: input.tools, usage: input.usage, turnId: input.turnId },
      );
    return {};
  }
  if (!input.providerError) {
    const thrown =
      input.error instanceof TurnBackendProviderError ||
      input.error instanceof ModelNotOfferedError
        ? input.error.providerError
        : classifyProviderError({
            provider: input.provider,
            model: input.model ?? null,
            message,
          });
    logProviderError(thrown, { model: input.model ?? null });
    if (
      thrown.kind === "unauthenticated" &&
      !input.assistantText &&
      input.tools.length === 0
    )
      thrown.undelivered_prompt = input.text;
    if (thrown.kind === "unauthenticated") {
      noteAuthFailure(thrown.provider);
      reportRevokedServedToken(
        thrown,
        input.usedTokens.digestFor(thrown.provider),
      );
    }
    if (thrown.kind === "quota_exhausted")
      noteQuotaExhausted(thrown.provider, thrown.resets_at);
    if (thrown.kind !== "unknown") {
      appendAssistantMessageAt(
        input.conversationsDir,
        input.conversationId,
        input.assistantText,
        {
          tools: input.tools,
          usage: input.usage,
          providerError: thrown,
          turnId: input.turnId,
        },
      );
      input.emit({ type: "provider_error", data: thrown });
      return {};
    }
  }
  if (input.assistantText || input.providerError)
    appendAssistantMessageAt(
      input.conversationsDir,
      input.conversationId,
      input.assistantText,
      {
        tools: input.tools,
        usage: input.usage,
        providerError: input.providerError,
        turnId: input.turnId,
      },
    );
  return { error: message };
}
