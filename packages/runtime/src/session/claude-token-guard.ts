import type { ProviderError } from "@houston/runtime-client";
import { authStorage } from "../auth/storage";
import { readAnthropicToken } from "../backends/claude/read-token";
import type { LruCache } from "../lru";
import type { Conversation } from "./conversation-cache";

const CLAUDE_BACKEND_ID = "anthropic";

export function claudeSessionTokenStale(conv: Conversation): boolean {
  if (conv.backendId !== CLAUDE_BACKEND_ID) return false;
  const pinned = conv.session.getUsedAccessDigest?.();
  if (pinned === undefined) return false;
  return (
    pinned !==
    readAnthropicToken({ get: (id) => authStorage.get(id) })?.accessDigest
  );
}

export function evictClaudeSessionOnRevokedToken(
  cache: Pick<LruCache<string, Conversation>, "peek" | "delete">,
  id: string,
  conv: Conversation,
  err: ProviderError | undefined,
): boolean {
  if (conv.backendId !== CLAUDE_BACKEND_ID) return false;
  if (err?.kind !== "unauthenticated" || err.cause !== "token_revoked")
    return false;
  if ((conv.pending ?? 0) > 1) return false;
  if (cache.peek(id) === conv) cache.delete(id);
  conv.session.dispose();
  return true;
}
