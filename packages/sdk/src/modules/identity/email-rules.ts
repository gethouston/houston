// WHY: Only trim and lowercase; folding dots or plus tags would link a different inbox. ADR-0028
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function sameAddress(claim: string | null, address: string): boolean {
  return claim !== null && normalizeAddress(claim) === address;
}

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
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const { email } = claims as Record<string, unknown>;
  return typeof email === "string" ? email : null;
}
