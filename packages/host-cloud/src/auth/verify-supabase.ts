import {
  DevTokenVerifier,
  parseServiceTokens,
  ServiceTokenVerifier,
  stripBearer,
} from "@houston/host/src/auth/verify";
import { config } from "@houston/host/src/config";
import type { UserId } from "@houston/host/src/domain/types";
import type { TokenVerifier } from "@houston/host/src/ports";
import {
  createRemoteJWKSet,
  type JWTVerifyGetKey,
  errors as joseErrors,
  jwtVerify,
} from "jose";

/**
 * The CLOUD token verifier — the closed half of the auth/verify.ts split.
 * Supabase access-token verification: a caller presents a bearer; we resolve it
 * to a principal (`{ userId }`) or `null` if the token is invalid/expired.
 *
 * The open dev / single-user / service-token verifiers (and the shared
 * `stripBearer` / `parseServiceTokens` helpers) stay in `@houston/host`
 * (auth/verify.ts). `makeTokenVerifier` is a CLOUD wiring concern (it picks
 * dev-vs-Supabase from `config`), so it lives here and is called from the cloud
 * entry point (`@houston/host-cloud` main.ts).
 *
 * Failure policy (CLAUDE.md "no silent failures"): only *authentication*
 * failures resolve to `null`. An auth failure is any of jose's typed JOSE errors
 * (bad signature, expired, malformed, claim mismatch, no matching key). Anything
 * else (a misconfiguration, a network blow-up that isn't a JOSE error, a
 * programmer bug) is re-thrown so it surfaces rather than masquerading as a mere
 * "invalid token".
 */

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

/**
 * Picks the verifier: explicit Supabase config (CP_SUPABASE_JWKS_URL or
 * CP_SUPABASE_JWT_SECRET) always wins — INCLUDING in `dev` mode, so a local
 * gateway (fake stores, real identity) can verify real Google-issued sessions,
 * e.g. when simulating the desktop→gateway integrations path in `pnpm dev`.
 * Dev with no Supabase config falls back to DevTokenVerifier (`dev:<user>`
 * bearers). Production requires Supabase config (the constructor refuses to
 * start without a verification method). CP_SERVICE_TOKENS, when set, wraps
 * either with the static service-token map (evals harness).
 */
export function makeTokenVerifier(): TokenVerifier {
  const supabaseConfigured = Boolean(
    config.supabaseJwksUrl || config.supabaseJwtSecret,
  );
  const base: TokenVerifier =
    config.dev && !supabaseConfigured
      ? new DevTokenVerifier()
      : new SupabaseTokenVerifier({
          jwtSecret: config.supabaseJwtSecret,
          jwksUrl: config.supabaseJwksUrl,
          issuer: config.supabaseJwtIssuer,
        });
  const tokens = parseServiceTokens(config.serviceTokens);
  return tokens.size > 0 ? new ServiceTokenVerifier(tokens, base) : base;
}
