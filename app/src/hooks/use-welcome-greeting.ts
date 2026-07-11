/**
 * Whether the welcome chat's hardcoded greeting should show (HOU-713).
 *
 * The "agent is getting ready" reveal beat belonged to the old welcome-mission
 * launch flow, which is gone. A `welcome-` conversation now only ever appears
 * on boards created by older builds, and those always reveal instantly — the
 * greeting is derived from the session key, never persisted. The hook signature
 * is kept for `use-agent-chat-panel`; the reveal reduces to "is this a welcome
 * session".
 */

import { isWelcomeSessionKey } from "../lib/agent-welcome";

export function useWelcomeGreetingRevealed(
  sessionKey: string | null | undefined,
): boolean {
  return isWelcomeSessionKey(sessionKey);
}
