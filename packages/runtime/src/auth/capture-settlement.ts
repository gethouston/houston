import {
  hasRefreshToken,
  readAuthFile,
  type ServedCredential,
  scrubRefreshTokenAt,
} from "./auth-file";

/**
 * Serve-sync self-heal for a capture whose post-PUT scrub never landed
 * (PRODUCT-1318).
 *
 * The connect-once capture stores the full credential centrally FIRST and only
 * then scrubs the runtime's refresh token. When that scrub fails (and the
 * host's bounded retries are exhausted), the leftover refresh-bearing entry
 * used to be permanent: serve apply skips it (the mid-capture guard),
 * removeServedCredentialAt refuses to delete it, and this pod silently kept
 * rotating the family on its own — two rotators, mutual invalid_grant,
 * org-wide sign-out.
 *
 * This runs on every serve sync and finishes the settlement: when the central
 * store answers `served` for a provider whose local entry still bears a
 * refresh token, the ACCESS TOKEN decides whether that capture already landed.
 *  - SAME access centrally and locally → the central row IS this very
 *    credential (the PUT landed; only the scrub was lost) → scrub is safe and
 *    overdue.
 *  - DIFFERENT access → a genuinely fresh login the store has not captured yet
 *    (the legitimate mid-capture window), or a central row the gateway already
 *    rotated past this one. Leave it alone — the capture path owns it.
 *
 * The residual gap is deliberate: if the gateway rotates the access token
 * before the first sync after a failed scrub, the digests never match again
 * and the entry survives until the user reconnects. That requires the scrub to
 * fail all its capture-time retries AND no sync to run until the access
 * expires (hours), while syncs run before every turn and status poll —
 * accepted, and far smaller than the permanent leak this replaces.
 *
 * Returns whether it scrubbed (the caller logs the PRODUCT-1318 event — a
 * heal firing at all means a capture-time scrub was lost).
 */
export function scrubSettledCaptureAt(
  path: string,
  served: ServedCredential,
): boolean {
  if (served.kind === "api_key") return false; // different family by construction
  const cred = readAuthFile(path)[served.provider];
  if (cred?.type !== "oauth" || !hasRefreshToken(cred)) return false;
  if (cred.access !== served.access) return false; // real mid-capture: hands off
  return scrubRefreshTokenAt(path, served.provider);
}
