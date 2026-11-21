import type { UserId } from "../domain/types";
import type { TokenVerifier } from "../ports";

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
