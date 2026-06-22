import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
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
  return lower.startsWith("bearer ")
    ? trimmed.slice("bearer ".length).trim()
    : trimmed;
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
 * The local profile's identity adapter: one machine, one human. Every request
 * carrying the host's boot token resolves to the owner principal, so the
 * ENTIRE authorize() seam runs unchanged locally — same code path as cloud,
 * degenerate adapter. The token is still required: the local host binds
 * loopback with a random per-boot token (the Tauri shell reads it from the
 * startup banner), so other local processes can't drive the agents.
 */
export class SingleUserVerifier implements TokenVerifier {
  constructor(private readonly opts: { token: string; userId?: UserId }) {
    if (!opts.token)
      throw new Error("SingleUserVerifier requires a non-empty boot token");
  }

  async verify(bearer: string): Promise<{ userId: UserId } | null> {
    const token = stripBearer(bearer);
    if (token !== this.opts.token) return null;
    return { userId: this.opts.userId ?? "local-owner" };
  }
}

/**
 * Static service tokens for unattended callers (the nightly evals harness):
 * `CP_SERVICE_TOKENS="<token>=<userId>,..."`. Off by default. A match resolves
 * to its mapped principal; a miss falls through to the wrapped verifier, so
 * user JWTs keep working unchanged. Tokens are full-length secrets minted with
 * `openssl rand -hex 32` — never user-chosen strings.
 */
export class ServiceTokenVerifier implements TokenVerifier {
  constructor(
    private readonly tokens: Map<string, UserId>,
    private readonly next: TokenVerifier,
  ) {}

  async verify(bearer: string): Promise<{ userId: UserId } | null> {
    const token = stripBearer(bearer);
    const userId = this.tokens.get(token);
    if (userId) return { userId };
    return this.next.verify(bearer);
  }
}

/** Parse `tok=user,tok2=user2`; malformed entries are a startup error, not a skip. */
export function parseServiceTokens(raw: string): Map<string, UserId> {
  const map = new Map<string, UserId>();
  for (const entry of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const eq = entry.indexOf("=");
    const token = eq > 0 ? entry.slice(0, eq).trim() : "";
    const userId = eq > 0 ? entry.slice(eq + 1).trim() : "";
    if (!token || !userId) {
      throw new Error(
        `CP_SERVICE_TOKENS entry is not <token>=<userId>: "${entry}"`,
      );
    }
    if (token.length < 32) {
      throw new Error(
        "CP_SERVICE_TOKENS tokens must be at least 32 chars (mint with `openssl rand -hex 32`)",
      );
    }
    map.set(token, userId);
  }
  return map;
}

/**
 * Picks the verifier for the current mode: DevTokenVerifier in `dev`, the real
 * Supabase verifier otherwise. The Supabase verifier's constructor enforces
 * that at least one verification method is configured. CP_SERVICE_TOKENS, when
 * set, wraps either with the static service-token map (evals harness).
 */
export function makeTokenVerifier(): TokenVerifier {
  const base: TokenVerifier = config.dev
    ? new DevTokenVerifier()
    : new SupabaseTokenVerifier({
        jwtSecret: config.supabaseJwtSecret,
        jwksUrl: config.supabaseJwksUrl,
        issuer: config.supabaseJwtIssuer,
      });
  const tokens = parseServiceTokens(config.serviceTokens);
  return tokens.size > 0 ? new ServiceTokenVerifier(tokens, base) : base;
}
