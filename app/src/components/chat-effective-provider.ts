/**
 * Provider the chat composer should use. Drives the model-selector dropdown and
 * the provider forwarded to the engine on send. Mirrors the engine's
 * `ResolveMode::Interactive`.
 *
 * The preferred provider is the explicit per-chat (activity) or per-agent one,
 * else the last-used, else `"anthropic"`. How it's used depends on whether the
 * conversation has started:
 *
 * 1. Once the conversation HAS messages, the provider is FROZEN to `preferred`
 *    even if it's logged out: never auth-switch a turn the user already started
 *    onto a different connected provider (that would answer — and bill — under a
 *    model they never chose). A logged-out provider instead surfaces the
 *    reconnect card (`afterMessages` renders `ProviderReconnectCard`). The
 *    dropdown is locked in this state too.
 * 2. For a fresh, message-less composer (initial selection), use `preferred`
 *    when it's authenticated, otherwise fall back to a provider the user IS
 *    logged into. This both keeps an OpenAI-only user off Claude (#483) AND
 *    never defaults a brand-new chat onto a disconnected provider — even the
 *    agent's own configured default is auth-gated here, so an agent set to a
 *    logged-out provider opens new chats on a connected one (the picker still
 *    lets the user switch). Switching is safe because no turn has run yet.
 * 3. When nothing is authenticated (or statuses haven't loaded yet), fall back
 *    to `preferred` so the value is never empty.
 *
 * NOTE: routines/onboarding/summaries are the unattended counterpart and DO
 * auth-switch an explicit provider — that lives in the engine, not here.
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
  const preferred =
    activityProvider ?? agentProvider ?? lastUsedProvider ?? "anthropic";

  // Mid-conversation: freeze. Honor `preferred` as-is even when logged out so a
  // logout surfaces the reconnect card instead of silently switching providers.
  if (hasMessages) return preferred;

  // Fresh composer (initial selection): never default onto a disconnected
  // provider — use `preferred` when connected, else any connected provider.
  if (authenticatedProviders.includes(preferred)) return preferred;
  return authenticatedProviders[0] ?? preferred;
}
