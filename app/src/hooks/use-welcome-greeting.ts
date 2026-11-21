import { isWelcomeSessionKey } from "../lib/agent-welcome";

export function useWelcomeGreetingRevealed(
  sessionKey: string | null | undefined,
): boolean {
  return isWelcomeSessionKey(sessionKey);
}
