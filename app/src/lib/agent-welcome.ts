export const WELCOME_SESSION_PREFIX = "welcome-";

export function isWelcomeSessionKey(
  sessionKey: string | null | undefined,
): boolean {
  return Boolean(sessionKey?.startsWith(WELCOME_SESSION_PREFIX));
}
