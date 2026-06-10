/**
 * Provider the chat composer should use, resolved from most- to least-specific
 * signal. Drives both the model-selector dropdown and the provider forwarded
 * to the engine on send.
 *
 * Order:
 * 1. The activity's per-mission provider override.
 * 2. The agent config's provider.
 * 3. The user's last-used provider preference (`default_provider`, written by
 *    `setLastUsed` on every provider pick) — so an OpenAI-only user opening an
 *    agent with no provider configured doesn't fall through to Claude and fail
 *    auth (#483).
 * 4. `"anthropic"` — last resort, matching the engine's factory default so the
 *    value is never empty.
 *
 * Mirrors the engine's `resolve_provider` fallback chain so the dropdown and
 * the engine agree on which provider actually runs.
 */
export function resolveEffectiveProvider(
  activityProvider: string | null,
  agentProvider: string | null,
  lastUsedProvider: string | null,
): string {
  return activityProvider ?? agentProvider ?? lastUsedProvider ?? "anthropic";
}
