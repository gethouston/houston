const REVOCATION_CONFIRMED_PATTERNS = [
  "token_revoked",
  "has been revoked",
  "access revoked",
  "app_session_terminated",
  "refresh_token_invalidated",
];

export function revocationConfirmed(message: string): boolean {
  const lower = message.toLowerCase();
  return REVOCATION_CONFIRMED_PATTERNS.some((p) => lower.includes(p));
}
