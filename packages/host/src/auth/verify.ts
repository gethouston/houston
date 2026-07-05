import type { UserId } from "../domain/types";
import type { TokenVerifier } from "../ports";

/**
 * The OPEN token verifiers: dev, the single-local-user (desktop) adapter, and the
 * static service-token wrapper, plus the shared `stripBearer` / `parseServiceTokens`
 * helpers.
 *
 * The cloud verifier (`SupabaseTokenVerifier`, jose/JWKS) and its
 * `makeTokenVerifier` factory were retired with `@houston/host-cloud` (git
 * history) — the shipped cloud authenticates at the private gateway instead. A
 * future closed verifier would implement `TokenVerifier` behind the port and
 * can reuse `stripBearer` exported from here.
 *
 * Failure policy (CLAUDE.md "no silent failures"): only *authentication*
 * failures resolve to `null`; everything else is re-thrown so it surfaces rather
 * than masquerading as a mere "invalid token".
 */

/** A bearer may arrive with or without the "Bearer " scheme prefix. */
export function stripBearer(bearer: string): string {
  const trimmed = bearer.trim();
  const lower = trimmed.toLowerCase();
  return lower.startsWith("bearer ")
    ? trimmed.slice("bearer ".length).trim()
    : trimmed;
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
