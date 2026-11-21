export function preferredProvider(
  activityProvider: string | null,
  agentProvider: string | null,
  lastUsedProvider: string | null,
): string | null {
  return activityProvider || agentProvider || lastUsedProvider || null;
}

export function resolveEffectiveProvider(
  activityProvider: string | null,
  agentProvider: string | null,
  lastUsedProvider: string | null,
  authenticatedProviders: string[],
  hasMessages: boolean,
  unconfirmedProviders: readonly string[] = [],
): string {
  const preferred =
    preferredProvider(activityProvider, agentProvider, lastUsedProvider) ??
    "anthropic";

  if (hasMessages) return preferred;

  if (authenticatedProviders.includes(preferred)) return preferred;
  if (unconfirmedProviders.includes(preferred)) return preferred;
  return authenticatedProviders[0] ?? preferred;
}
