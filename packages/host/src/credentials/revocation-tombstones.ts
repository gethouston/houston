import { credentialScopeKey, TEAM_SCOPE_KEY } from "./scope-key";

const TOMBSTONE_TTL_MS = 15 * 60_000;

export class RevokedRefillBlockedError extends Error {
  constructor(provider: string) {
    super(
      `the ${provider} credential was just revoked by the provider; refusing to restore a cached copy — reconnect the provider to sign in again`,
    );
  }
}

type TombstoneScope = {
  workspaceId: string;
  provider: string;
  actingAs?: string;
};

export class RevocationTombstones {
  private readonly marks = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = TOMBSTONE_TTL_MS,
  ) {}

  mark(scope: TombstoneScope & { scope: "personal" | "team" }): boolean {
    const key = this.key(
      scope.workspaceId,
      scope.scope === "personal"
        ? credentialScopeKey({ actingAs: scope.actingAs })
        : TEAM_SCOPE_KEY,
      scope.provider,
    );
    const wasActive = this.activeKey(key);
    this.sweep();
    this.marks.set(key, this.now() + this.ttlMs);
    return wasActive;
  }

  active(scope: TombstoneScope): boolean {
    return this.keysFor(scope).some((k) => this.activeKey(k));
  }

  clear(scope: TombstoneScope): void {
    for (const k of this.keysFor(scope)) this.marks.delete(k);
  }

  private keysFor(scope: TombstoneScope): string[] {
    const acting = credentialScopeKey({ actingAs: scope.actingAs });
    const keys = [this.key(scope.workspaceId, acting, scope.provider)];
    if (acting !== TEAM_SCOPE_KEY)
      keys.push(this.key(scope.workspaceId, TEAM_SCOPE_KEY, scope.provider));
    return keys;
  }

  private key(workspaceId: string, scopeKey: string, provider: string): string {
    return `${workspaceId}:${scopeKey}:${provider}`;
  }

  private activeKey(key: string): boolean {
    const until = this.marks.get(key);
    return until !== undefined && until > this.now();
  }

  private sweep(): void {
    const now = this.now();
    for (const [k, until] of this.marks) if (until <= now) this.marks.delete(k);
  }
}

export const sharedRevocationTombstones = new RevocationTombstones();
