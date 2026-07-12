// PKCE (RFC 7636) + CSRF-state primitives for the desktop loopback OAuth flow.
//
// Pure WebCrypto — no Tauri, no network — so it is unit-testable under the
// `node:test` runner (which has global `crypto`, `btoa`, `TextEncoder`). The
// desktop-oauth driver mints a fresh `code_verifier` + S256 `code_challenge`
// and a random `state` per authorize call; the challenge travels in the
// authorize URL and the verifier is redeemed at the token endpoint.

/** Base64url-encode raw bytes (no padding, `-`/`_` alphabet), per RFC 7636. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 32 random bytes → 43-char base64url string (within the 43-128 char range). */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** S256 challenge: base64url(SHA-256(code_verifier)). */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/** An opaque random `state` value for CSRF binding of the authorize round-trip. */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
