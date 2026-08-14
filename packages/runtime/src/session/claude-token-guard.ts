import type { ProviderError } from "@houston/runtime-client";
import { authStorage } from "../auth/storage";
import { readAnthropicToken } from "../backends/claude/read-token";
import type { LruCache } from "../lru";
import type { Conversation } from "./conversation-cache";

/**
 * PRODUCT-1355: keep cached Claude sessions on the CURRENT Anthropic token.
 *
 * The Claude Agent SDK session carries its credential in the subprocess env,
 * read from the store when the session (or, since PRODUCT-1355, each prompt) is
 * prepared. A conversation touched regularly never idle-expires, so before that
 * fix a session outlived the gateway's normal token rotation and every turn on
 * it 401'd `token_revoked` forever — while the user's reconnects kept minting
 * credentials the pinned session never read (observed: 7 reconnects in 15 min
 * against one session). These two guards are the defense-in-depth around the
 * per-prompt re-read: a digest check at conversation lookup (layer 2) and an
 * eviction when a turn actually dies on a revoked token (layer 3).
 *
 * Both are scoped to the Claude backend: pi reads credentials per request via
 * the ModelRuntime, so its sessions can never pin a token.
 */

/** The Claude Agent SDK backend's registry id (see conversation-cache). */
const CLAUDE_BACKEND_ID = "anthropic";

/**
 * Layer 2: does this cached conversation hold a Claude session whose pinned
 * access token is no longer the stored one? A cheap, no-network check — one
 * store read, ambient-scoped exactly like the read the turn itself would make
 * (the whole request runs inside the acting identity, HOU-976). Sessions with
 * no digest (api_key, config-dir credential) and non-Claude backends never
 * match, so they are never rebuilt from under a working setup.
 */
export function claudeSessionTokenStale(conv: Conversation): boolean {
  if (conv.backendId !== CLAUDE_BACKEND_ID) return false;
  const pinned = conv.session.getUsedAccessDigest?.();
  if (pinned === undefined) return false;
  return pinned !== readAnthropicToken(authStorage)?.accessDigest;
}

/**
 * Layer 3: a turn that ended on `unauthenticated`/`token_revoked` proves the
 * cached Claude session's token is dead — evict it so the next attempt (after
 * the user reconnects) rebuilds on the fresh credential instead of retrying
 * the corpse. Chat history lives on disk; only the in-memory session is
 * disposed, and the rebuilt session resumes the same SDK transcript.
 *
 * Skipped while OTHER turns are still queued on this conversation
 * (`pending > 1` — the settling turn itself holds one count): those turns
 * captured this Conversation object, and disposing its session would make
 * their prompts silently no-op. The LAST settling turn evicts instead, and the
 * per-prompt credential re-read keeps the queued turns honest meanwhile.
 * Deleted only when the cache still maps `id` to THIS conversation, so a
 * concurrent rebuild is never torn down by a stale settle.
 */
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
