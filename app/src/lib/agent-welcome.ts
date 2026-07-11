/**
 * Welcome-chat session marker.
 *
 * Older builds greeted a new agent with a "Meet {name}" welcome mission whose
 * row carried a `welcome-` session key; the chat renderer derives a hardcoded,
 * localized greeting for any conversation under that key (`use-agent-chat-panel`
 * `mapFeedItems` + `hooks/use-welcome-greeting.ts`). That launch flow is gone,
 * replaced by the agent's auto-started self-setup mission
 * (`lib/agent-setup-mission.ts`, a normal `activity-` mission), but the prefix
 * survives so boards created by those older builds keep rendering
 * their greeting. The greeting is DERIVED, never persisted, so no migration is
 * needed — only this marker check.
 */

export const WELCOME_SESSION_PREFIX = "welcome-";

export function isWelcomeSessionKey(
  sessionKey: string | null | undefined,
): boolean {
  return Boolean(sessionKey?.startsWith(WELCOME_SESSION_PREFIX));
}
