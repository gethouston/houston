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
 * 2. With no explicit provider (a fresh, never-configured agent), pick an
 *    **authenticated** provider — the preferred one (last-used, else
 *    `"anthropic"`) if logged in, otherwise whichever the user IS logged into —
 *    so an OpenAI-only user never lands on Claude and fails auth (#483). This is
 *    initial selection, not a mid-chat switch, so it's safe here.
 * 3. When nothing is authenticated (or statuses haven't loaded yet), fall back
 *    to the preferred provider so the value is never empty.
 *
 * NOTE: routines/onboarding/summaries are the unattended counterpart and DO
 * auth-switch an explicit provider — that lives in the engine
 * (`ResolveMode::Unattended`), not here.
 *
 * @param authenticatedProviders provider ids the user is currently logged into,
 *   in registry order (anthropic, openai).
 */
export function resolveEffectiveProvider(
  activityProvider: string | null,
  agentProvider: string | null,
  lastUsedProvider: string | null,
  authenticatedProviders: string[],
): string {
  const explicit = activityProvider ?? agentProvider;
  if (explicit) return explicit;

  const preferred = lastUsedProvider ?? "anthropic";
  if (authenticatedProviders.includes(preferred)) return preferred;
  return authenticatedProviders[0] ?? preferred;
}
