/**
 * Lowercase and trim, nothing else. Folding dots or plus tags would let a code
 * proved for one inbox link a different person's address, and an Apple relay
 * address only ever equals itself.
 */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** Whether `claim` names the already-normalized `address`. */
export function sameAddress(claim: string | null, address: string): boolean {
  return claim !== null && normalizeAddress(claim) === address;
}

/**
 * The `email` claim of an Identity Platform ID token, or null. The token came
 * straight from Identity Platform, so its payload is read, not verified.
 */
export function emailClaimOf(idToken: string): string | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  let claims: unknown;
  try {
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    claims = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // An unreadable token names no address: the caller refuses the link and
    // reports the mismatch.
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const { email } = claims as Record<string, unknown>;
  return typeof email === "string" ? email : null;
}
