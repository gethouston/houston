import type { FeedItem, ProviderError } from "@houston-ai/chat";
import { preferredProvider } from "../../chat-effective-provider.ts";

export function resolveProviderErrorForChat(
  err: ProviderError,
  chatProvider: string | null,
): ProviderError {
  if (err.provider) return err;
  if (!chatProvider) return err;
  return { ...err, provider: chatProvider };
}

export function errorCardProvider(args: {
  activityProvider: string | null;
  agentProvider: string | null;
  lastUsedProvider: string | null;
}): string | null {
  return preferredProvider(
    args.activityProvider,
    args.agentProvider,
    args.lastUsedProvider,
  );
}

export function resendsOriginalPrompt(err: ProviderError): boolean {
  return err.kind === "unauthenticated" && !!err.failed_prompt;
}

export function continuesTaskAfterReconnect(err: ProviderError): boolean {
  return err.kind === "unauthenticated" && !err.failed_prompt;
}

export function reconnectContinueText(
  err: ProviderError,
  genericContinuePrompt: string,
): string {
  return err.kind === "unauthenticated" && err.undelivered_prompt
    ? err.undelivered_prompt
    : genericContinuePrompt;
}

export function providerErrorRetryText(
  err: ProviderError,
  genericRetryPrompt: string,
): string {
  return err.kind === "unauthenticated" && err.failed_prompt
    ? err.failed_prompt
    : genericRetryPrompt;
}

export function isInlineAuthCard(item: FeedItem): boolean {
  return (
    item.feed_type === "provider_error" && item.data.kind === "unauthenticated"
  );
}
