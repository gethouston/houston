/**
 * Manage-token generation + hashing for the Agent Store (AGENT-NATIVE publish).
 *
 * A manage token is the per-agent secret returned once at POST /api/agents. It is
 * the ONLY credential that proves "this upload is mine" (edit, publish, delete).
 * We NEVER store it in the clear — only its SHA-256 hash (`manage_token_hash`).
 *
 * Web Crypto ONLY (globalThis.crypto) so this runs unchanged on Cloudflare
 * Workers, Node, and the browser. Rejection sampling keeps the character
 * distribution uniform across the 31-symbol alphabet (one random byte per
 * character; bytes that would bias the modulo are discarded and redrawn).
 */

/** Prefix so a leaked token is greppable/recognizable ("agst" = agent store). */
export const MANAGE_TOKEN_PREFIX = "agst_";

/** Number of random characters after the prefix. */
export const MANAGE_TOKEN_LENGTH = 40;

/** Unambiguous, URL-safe, lowercase alphabet (no 0,o,1,l,i). 31 symbols. */
export const MANAGE_TOKEN_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Generate a cryptographically-random manage token: `agst_` + 40 chars. */
export function newManageToken(): string {
  const alphabet = MANAGE_TOKEN_ALPHABET;
  const n = alphabet.length;
  // Largest multiple of n that fits in a byte; bytes >= this are rejected so the
  // modulo does not bias toward the low-valued characters.
  const ceiling = Math.floor(256 / n) * n;

  const out: string[] = [];
  const buf = new Uint8Array(MANAGE_TOKEN_LENGTH * 2); // over-draw to reduce reseeds
  while (out.length < MANAGE_TOKEN_LENGTH) {
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < MANAGE_TOKEN_LENGTH; i++) {
      const b = buf[i];
      if (b < ceiling) out.push(alphabet[b % n]);
    }
  }
  return MANAGE_TOKEN_PREFIX + out.join("");
}

/** SHA-256 of a token as lowercase hex. Deterministic; safe to store + index. */
export async function hashManageToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Constant-time comparison of two hex strings. Returns false immediately on a
 * length mismatch (hashes are fixed-length, so length is not secret), then XORs
 * every char code so the loop time does not depend on where the first byte
 * differs.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
