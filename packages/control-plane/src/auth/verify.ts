import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { config } from "../config";
import type { UserId } from "../domain/types";
import type { TokenVerifier } from "../ports";

/**
 * Supabase access-token verification. A caller presents a bearer; we resolve it
 * to a principal (`{ userId }`) or `null` if the token is invalid/expired.
 *
 * Two flavours, picked at startup by `makeTokenVerifier`:
 *   - SupabaseTokenVerifier — verifies a real Supabase JWT (HS256 secret or
 *     RS256 via JWKS). Production path.
 *   - DevTokenVerifier — accepts "dev:<userId>" so the control plane boots with zero
 *     cloud deps in `dev` mode.
 *
 * Failure policy (CLAUDE.md "no silent failures"): only *authentication*
 * failures resolve to `null`. An auth failure is any of jose's typed JOSE
 * errors (bad signature, expired, malformed, claim mismatch, no matching key).
 * Anything else (a misconfiguration, a network blow-up that isn't a JOSE error,
 * a programmer bug) is re-thrown so it surfaces rather than masquerading as a
 * mere "invalid token".
 */

/** A bearer may arrive with or without the "Bearer " scheme prefix. */
function stripBearer(bearer: string): string {
  const trimmed = bearer.trim();
  const lower = trimmed.toLowerCase();
  return lower.startsWith("bearer ") ? trimmed.slice("bearer ".length).trim() : trimmed;
}

/** True for jose's auth-failure family — the only errors that become `null`. */
function isAuthFailure(err: unknown): boolean {
  return err instanceof joseErrors.JOSEError;
}

/** Encodes an HS256 shared secret as the key material jose's verify expects. */
function hs256Key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export class SupabaseTokenVerifier implements TokenVerifier {
  private readonly hsKey: Uint8Array | null;
  private readonly jwks: JWTVerifyGetKey | null;
  private readonly issuer: string;

  constructor(opts: { jwtSecret: string; jwksUrl: string; issuer: string }) {
    this.hsKey = opts.jwtSecret ? hs256Key(opts.jwtSecret) : null;
    this.jwks = opts.jwksUrl ? createRemoteJWKSet(new URL(opts.jwksUrl)) : null;
    this.issuer = opts.issuer;

    if (!this.hsKey && !this.jwks) {
      // Misconfiguration, not an auth failure: refuse to start a verifier that
      // can never verify anything. Surfaced loudly per beta policy.
      throw new Error(
        "SupabaseTokenVerifier requires CP_SUPABASE_JWT_SECRET (HS256) or CP_SUPABASE_JWKS_URL (RS256)",
      );
    }
  }

  async verify(bearer: string): Promise<{ userId: UserId } | null> {
    const token = stripBearer(bearer);
    if (!token) return null;

    const verifyOpts = this.issuer ? { issuer: this.issuer } : undefined;

    // Prefer asymmetric (JWKS/RS256) when configured; fall back to the shared
    // HS256 secret. Each path's auth failures collapse to null; the last
    // configured path's failure decides the result.
    let lastError: unknown = null;

    if (this.jwks) {
      try {
        const { payload } = await jwtVerify(token, this.jwks, verifyOpts);
        return this.principalFrom(payload.sub);
      } catch (err) {
        if (!isAuthFailure(err)) throw err;
        lastError = err;
      }
    }

    if (this.hsKey) {
      try {
        const { payload } = await jwtVerify(token, this.hsKey, verifyOpts);
        return this.principalFrom(payload.sub);
      } catch (err) {
        if (!isAuthFailure(err)) throw err;
        lastError = err;
      }
    }

    // Every configured path rejected the token as an auth failure.
    void lastError;
    return null;
  }

  /** A token without a `sub` is not a usable principal — treat as auth failure. */
  private principalFrom(sub: string | undefined): { userId: UserId } | null {
    return sub ? { userId: sub } : null;
  }
}

export class DevTokenVerifier implements TokenVerifier {
  async verify(bearer: string): Promise<{ userId: UserId } | null> {
    const token = stripBearer(bearer);
    const prefix = "dev:";
    if (!token.startsWith(prefix)) return null;
    const userId = token.slice(prefix.length).trim();
    return userId ? { userId } : null;
  }
}

/**
 * Picks the verifier for the current mode: DevTokenVerifier in `dev`, the real
 * Supabase verifier otherwise. The Supabase verifier's constructor enforces
 * that at least one verification method is configured.
 */
export function makeTokenVerifier(): TokenVerifier {
  if (config.dev) return new DevTokenVerifier();
  return new SupabaseTokenVerifier({
    jwtSecret: config.supabaseJwtSecret,
    jwksUrl: config.supabaseJwksUrl,
    issuer: config.supabaseJwtIssuer,
  });
}
