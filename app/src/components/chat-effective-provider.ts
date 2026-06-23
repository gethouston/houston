/**
 * Provider the chat composer should use. Drives the model-selector dropdown and
 * the provider forwarded to the engine on send. Mirrors the engine's
 * `ResolveMode::Interactive`.
 *
 * 1. An explicit per-chat (activity) or per-agent provider is honored **as-is**,
 *    even when it's logged out. Chat must never silently switch the user to a
 *    different model mid-conversation; a logged-out configured provider instead
 *    surfaces the reconnect card (the send fails auth and `afterMessages` renders
 *    `ProviderReconnectCard`). The dropdown is also locked once the chat has
 *    messages.
 * 2. With no explicit provider AND no messages yet (a fresh composer / a
 *    never-configured agent), pick an **authenticated** provider — the preferred
 *    one (last-used, else `"anthropic"`) if logged in, otherwise whichever the
 *    user IS logged into — so an OpenAI-only user never lands on Claude and
 *    fails auth (#483). This is initial selection, not a mid-chat switch, so the
 *    auth-driven pick is safe here.
 * 3. Once the conversation HAS messages, the provider is frozen to the preferred
 *    one even if it's logged out: the auth-driven pick from (2) is suppressed so
 *    a provider that logs out mid-conversation surfaces the reconnect card
 *    instead of silently handing the turn to another connected provider
 *    (answering — and billing — under a model the user never chose).
 * 4. When nothing is authenticated (or statuses haven't loaded yet), fall back
 *    to the preferred provider so the value is never empty.
 *
 * NOTE: routines/onboarding/summaries are the unattended counterpart and DO
 * auth-switch an explicit provider — that lives in the engine
 * (`ResolveMode::Unattended`), not here.
 *
 * @param authenticatedProviders provider ids the user is currently logged into,
 *   in registry order (anthropic, openai).
 * @param hasMessages whether the open conversation already has turns. Once true,
 *   the provider is frozen (no auth-driven switch) so logging out mid-chat shows
 *   the reconnect card rather than silently moving to another connected provider.
 */
export function resolveEffectiveProvider(
  activityProvider: string | null,
  agentProvider: string | null,
  lastUsedProvider: string | null,
  authenticatedProviders: string[],
  hasMessages: boolean,
): string {
  const explicit = activityProvider ?? agentProvider;
  if (explicit) return explicit;

  const preferred = lastUsedProvider ?? "anthropic";
  // Freeze an in-progress conversation: never auth-switch it to a different
  // connected provider just because the one it has been using logged out. A
  // silent switch answers (and bills) under a model the user never chose; the
  // logged-out provider must surface the reconnect card instead. The auth-pick
  // below is for INITIAL selection of a fresh, message-less composer only (#483).
  if (hasMessages) return preferred;

  if (authenticatedProviders.includes(preferred)) return preferred;
  return authenticatedProviders[0] ?? preferred;
}
