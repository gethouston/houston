import type { FeedItem, ProviderError } from "@houston-ai/chat";

/**
 * Pure helpers for the not-connected reconnect card (HOU-676).
 *
 * When the TS engine refuses a send because no provider is connected, the SDK
 * settles the turn as a typed `unauthenticated` card. Two things about that
 * card only the SURFACE can resolve:
 *
 *  - `provider` may be empty — the runtime can't name one (nothing is
 *    connected) and the SDK only knows the composer's pick when the send
 *    carried an explicit switch. The chat itself always knows its provider.
 *  - `failed_prompt` marks a send that never reached the engine: retrying
 *    with the generic "try again" prompt would arrive with no context, so
 *    "Send again" must resend the original text.
 */

/**
 * Label a provider-error card with THIS chat's provider when the engine
 * couldn't name one. Never rewrites a card that already names a provider —
 * a foreign provider's card must stay honest about who failed.
 */
export function resolveProviderErrorForChat(
  err: ProviderError,
  chatProvider: string,
): ProviderError {
  if (err.provider) return err;
  return { ...err, provider: chatProvider };
}

/**
 * Whether this card's retry re-delivers the ORIGINAL refused prompt (the send
 * never reached the engine). Such a retry fires automatically on reconnect
 * and must NOT push a second user bubble — the original bubble already shows
 * the message, and a duplicate would read as a double send. A generic retry
 * (live-turn failure) is a new message and keeps its bubble.
 */
export function resendsOriginalPrompt(err: ProviderError): boolean {
  return err.kind === "unauthenticated" && !!err.failed_prompt;
}

/**
 * Whether this card's retry resumes an INTERRUPTED turn (HOU-718) — a
 * mid-turn auth failure, where the user's message is already persisted in
 * the transcript. Such a retry fires automatically once sign-in completes
 * and sends a hidden auto-continue message (see
 * `lib/auto-continue-message.ts`) so the agent picks the task back up
 * without the user retyping — and without a second visible bubble. The
 * refused-send card resends its original prompt instead
 * (`resendsOriginalPrompt`).
 */
export function continuesTaskAfterReconnect(err: ProviderError): boolean {
  return err.kind === "unauthenticated" && !err.failed_prompt;
}

/**
 * What the hidden auto-continue retry re-delivers: the turn's undelivered
 * user text when the model never received it (pi's prompt-time credential
 * guard raises BEFORE recording the message in its session store, so no
 * session context or rebuild ever sees it — a bare "continue" would earn an
 * honest "I don't see a previous task"), else the caller's generic continue
 * nudge (a streamed mid-turn failure: the model saw the message, its context
 * is intact).
 */
export function reconnectContinueText(
  err: ProviderError,
  genericContinuePrompt: string,
): string {
  return err.kind === "unauthenticated" && err.undelivered_prompt
    ? err.undelivered_prompt
    : genericContinuePrompt;
}

/**
 * What the card's retry should send: the refused original prompt when the
 * message never reached the engine, else the caller's generic retry prompt
 * (the turn's context is already server-side for live-turn failures).
 */
export function providerErrorRetryText(
  err: ProviderError,
  genericRetryPrompt: string,
): string {
  return err.kind === "unauthenticated" && err.failed_prompt
    ? err.failed_prompt
    : genericRetryPrompt;
}

/**
 * Whether a feed item is a persisted inline reconnect card — the signal that
 * the store-driven (auto-dismissing) card must not also render. One reconnect
 * surface per chat, and the inline card wins REGARDLESS of which provider it
 * names: it carries the provider that actually failed (stamped by the runtime
 * on the turn), which is truer than the chat-provider resolution chain — a
 * stale activity record once resolved a Jan (openai-compatible) chat to
 * "anthropic" and rendered a second, WRONG-provider store card next to the
 * correct inline one.
 */
export function isInlineAuthCard(item: FeedItem): boolean {
  return (
    item.feed_type === "provider_error" && item.data.kind === "unauthenticated"
  );
}
