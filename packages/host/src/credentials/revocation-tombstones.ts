import { credentialScopeKey, TEAM_SCOPE_KEY } from "./scope-key";

/**
 * Short-lived tombstones for credentials a PROVIDER revoked (HOUSTON-APP-530).
 *
 * A confirmed revoked-token report (routes/credential-revoked.ts) deletes the
 * central credential — that part works. What kept the Sentry issue alive was
 * everything that put the dead credential BACK: the legacy desktop reconcile
 * still shipping cached snapshots with `?if_absent=1` (HOU-950 removed the
 * client code, but old builds keep pushing on a 15–30s cadence), and the pod's
 * own automatic refills (legacy-fallback adoption in remote-store.ts, the serve
 * healer). Every refill of a revoked family fails the next turn, which reports,
 * which deletes, which invites the next refill — one Sentry error per cycle,
 * 734 events across 380 users in two weeks.
 *
 * The tombstone breaks the cycle at the pod host, the one place every refill
 * path crosses: after a confirmed revocation, AUTOMATIC refills of that
 * (workspace, scope, provider) are refused for a TTL. Deliberately blunt on
 * scope — a cached snapshot from the revoked family carries a DIFFERENT access
 * token than the one the report named (the gateway rotated the family since the
 * snapshot was cached), so a digest-scoped tombstone would not block it.
 *
 * USER-driven connects are never blocked: a fresh browser login / setup-token
 * paste arrives WITHOUT `ifAbsent` and clears the tombstone on store. The TTL
 * bounds the cost of any clear-site we missed.
 */
const TOMBSTONE_TTL_MS = 15 * 60_000;

/** Thrown when an automatic (fill-only) push hits an active tombstone. */
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
  /** The acting identity of the caller, when there is one (HOU-976). */
  actingAs?: string;
};

export class RevocationTombstones {
  private readonly marks = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = TOMBSTONE_TTL_MS,
  ) {}

  /**
   * Record a confirmed revocation delete. `scope` is the ROW the report named:
   * a personal report tombstones the member's key, a team report the shared
   * one. Returns whether a tombstone for that key was STILL ACTIVE — a second
   * confirmed delete inside the window means something refilled a revoked
   * credential past the guards, which is the caller's cue to escalate.
   */
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

  /**
   * Whether an automatic refill for this caller must be refused. Checks the
   * caller's own scope key AND the shared team key: the pod cannot always
   * mirror the gateway's row resolution (a personal-space push carries an
   * acting identity while its serve reports the team row), and blocking a
   * refill too broadly costs at most one TTL of automatic recovery.
   */
  active(scope: TombstoneScope): boolean {
    return this.keysFor(scope).some((k) => this.activeKey(k));
  }

  /** A fresh user-driven connect supersedes the revocation. Clears both keys. */
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

  /** Drop aged-out entries so the map stays bounded on long-lived hosts. */
  private sweep(): void {
    const now = this.now();
    for (const [k, until] of this.marks) if (until <= now) this.marks.delete(k);
  }
}

/**
 * The process-wide instance (precedent: sharedCredentialRefresher). Every
 * consumer defaults to it so the revoked route, the claude-oauth push path,
 * the legacy-fallback adoption and the serve healer all see one ledger.
 */
export const sharedRevocationTombstones = new RevocationTombstones();
