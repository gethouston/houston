import { identityLog } from "./log.ts";

export interface IdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: { sign_in_provider?: string };
  exp?: number;
}

function base64UrlDecode(segment: string): string {
  const pad =
    segment.length % 4 === 0 ? "" : "=".repeat(4 - (segment.length % 4));
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeIdTokenClaims(idToken: string): IdTokenClaims | null {
  const payload = idToken.split(".")[1];
  if (!payload) {
    identityLog(
      "warn",
      "ID token has no payload segment, cannot decode claims",
      "identity/id-token",
    );
    return null;
  }
  let claims: unknown;
  try {
    claims = JSON.parse(base64UrlDecode(payload));
  } catch (e) {
    identityLog(
      "warn",
      `failed to decode ID token claims: ${String(e)}`,
      "identity/id-token",
    );
    return null;
  }
  if (
    typeof claims !== "object" ||
    claims === null ||
    typeof (claims as Record<string, unknown>).sub !== "string"
  ) {
    identityLog(
      "warn",
      "ID token claims missing a string `sub`, treating as invalid",
      "identity/id-token",
    );
    return null;
  }
  return claims as IdTokenClaims;
}
