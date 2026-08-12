import type { CredentialActing, WorkspaceCredential } from "../ports";
import { isExpiring, type RefreshOptions, refreshCredential } from "./refresh";
import { credentialScopeKey } from "./scope-key";

/**
 * How long a freshly rotated credential answers serves without touching the
 * store or the token endpoint. Long enough to absorb the burst a single turn
 * start produces (every agent runtime serves per turn AND per `/providers`
 * poll), far shorter than any access-token lifetime.
 */
const REFRESH_RESULT_TTL_MS = 30_000;

/** Performs one exchange. Shaped exactly like `refreshCredential`. */
export type CredentialRefresher = (
  cred: WorkspaceCredential,
  opts?: RefreshOptions,
) => Promise<WorkspaceCredential>;

export type CredentialRefreshRun = {
  workspaceId: string;
  provider: string;
  /** WHOSE credential this refresh is for; undefined = the shared team scope. */
  acting?: CredentialActing;
  /**
   * Re-read the credential centrally, inside the critical section. This — not
   * the copy the caller already read — is what gets refreshed: another host
   * process (or an earlier flight) may have rotated it in the meantime, and
   * `null` means the user disconnected mid-flight.
   */
  load: () => Promise<WorkspaceCredential | null>;
  /** Persist the rotated credential before it is handed to anyone. */
  persist: (cred: WorkspaceCredential) => Promise<void>;
  /** Retry/backoff knobs for this exchange (tests inject a no-op sleep). */
  refreshOpts?: RefreshOptions;
  /**
   * Refresher for THIS call, overriding the coalescer's own. The turn dispatch
   * path carries an injected refresher in its dependency bundle and still has
   * to land in the process-wide flight — one rotator per credential is the
   * whole point, so it brings its refresher to the shared coalescer rather than
   * keeping a private one.
   */
  doRefresh?: CredentialRefresher;
  /**
   * Expiry margin THIS caller needs (`isExpiring`'s `skewMs`). The serve route
   * passes its pi-validity-floor margin (routes/credential.ts, PRODUCT-1317) so
   * the in-flight re-check can't hand back a token the route already judged too
   * short-lived. Absent = `isExpiring`'s default.
   */
  skewMs?: number;
};

/**
 * The credential vanished between the caller's read and the critical section —
 * the user disconnected the provider mid-flight. Refreshing and persisting the
 * copy the caller still holds would RECREATE the row they just deleted, so the
 * flight stops here and the serve route answers "not connected".
 */
export class CredentialGoneError extends Error {
  constructor(provider: string) {
    super(`${provider} credential was disconnected during refresh`);
    this.name = "CredentialGoneError";
  }
}

/**
 * Single-flights OAuth refreshes per (workspace, SCOPE, provider).
 *
 * The control plane is the SINGLE refresher of each workspace's subscription
 * token (see refresh.ts) — but nothing enforced it on the serve path. A desktop
 * install runs one runtime process per agent, and each one serves per turn and
 * per `/providers` poll, so an expiring credential produced N simultaneous
 * refreshes of the SAME refresh token. Providers that rotate refresh tokens on
 * use (openai-codex) answer the first one and reject the rest with
 * `invalid_grant` — a RefreshRejectedError, which the serve route reads as "the
 * session ended" and deletes the credential. The user sees their provider
 * spontaneously disconnect. Coalescing makes the burst exactly one exchange.
 *
 * Scope is part of the key: one member's refresh must never hand its rotated
 * token to another member's serve (HOU-976).
 */
export class CredentialRefreshCoalescer {
  private readonly inFlight = new Map<string, Promise<WorkspaceCredential>>();
  private readonly results = new Map<
    string,
    { cred: WorkspaceCredential; at: number }
  >();

  constructor(
    private readonly doRefresh: CredentialRefresher = refreshCredential,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Resolve to a non-expiring credential, refreshing at most once per key at a
   * time. Rejects with whatever the refresh threw (the caller decides whether
   * that kills the credential or serves the stale token) — a failure is never
   * cached, so the next serve retries.
   */
  run(args: CredentialRefreshRun): Promise<WorkspaceCredential> {
    const key = this.keyOf(args.workspaceId, args.provider, args.acting);

    const cached = this.results.get(key);
    if (cached) {
      if (
        this.now() - cached.at < REFRESH_RESULT_TTL_MS &&
        !isExpiring(cached.cred, args.skewMs)
      )
        return Promise.resolve(cached.cred);
      this.results.delete(key);
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    // Identity-checked self-removal: a flight owns its slot and clears only
    // that slot, never a successor's. Deleting blindly would let a settling
    // loser evict the live flight that replaced it, and the next serve would
    // open a SECOND concurrent exchange against the same rotating token.
    const flight: Promise<WorkspaceCredential> = this.refreshOnce(
      key,
      args,
    ).finally(() => {
      if (this.inFlight.get(key) === flight) this.inFlight.delete(key);
    });
    this.inFlight.set(key, flight);
    return flight;
  }

  /**
   * Drop the cached RESULT for one key (e.g. the credential died) so the next
   * serve re-reads the store instead of answering from a stale rotation.
   *
   * In-flight state is deliberately untouched: callers reach here after store
   * I/O, by which time a NEW flight may own the slot. Evicting it would strand
   * that flight's waiters behind a second concurrent exchange of the same
   * rotating refresh token — the exact failure the coalescer exists to prevent.
   * A live flight re-reads the store inside its own critical section anyway.
   */
  forget(workspaceId: string, provider: string, acting?: CredentialActing) {
    this.results.delete(this.keyOf(workspaceId, provider, acting));
  }

  /** Drop all state. Tests only — a process holds one coalescer for its life. */
  reset() {
    this.results.clear();
    this.inFlight.clear();
  }

  private async refreshOnce(
    key: string,
    args: CredentialRefreshRun,
  ): Promise<WorkspaceCredential> {
    // Re-read INSIDE the critical section: another host process (or an earlier
    // flight whose result already aged out) may have rotated the token
    // already. Serving that costs nothing; refreshing again would burn a
    // rotated refresh token and revoke the family.
    const loaded = await args.load();
    // Gone, not merely stale: the user disconnected the provider while this
    // flight was queued. Falling back to the copy the caller read — refreshing
    // it and persisting the result — would recreate the row they deleted and
    // hand their agents a live token for a revoked connection.
    if (loaded === null) throw new CredentialGoneError(args.provider);
    if (!isExpiring(loaded, args.skewMs)) {
      this.remember(key, loaded);
      return loaded;
    }

    const refresh = args.doRefresh ?? this.doRefresh;
    const rotated = await refresh(loaded, args.refreshOpts);
    await args.persist(rotated);
    this.remember(key, rotated);
    console.info(
      `[credential-refresh] rotated ${rotated.provider} credential for workspace ${args.workspaceId}`,
    );
    return rotated;
  }

  /**
   * Cache one rotation and sweep whatever aged out. The entries hold FULL
   * credentials (access and refresh tokens), so without the sweep the map keeps
   * one live secret per (workspace, scope, provider) ever served, for the life
   * of the process.
   */
  private remember(key: string, cred: WorkspaceCredential) {
    const at = this.now();
    for (const [k, entry] of this.results)
      if (at - entry.at >= REFRESH_RESULT_TTL_MS) this.results.delete(k);
    this.results.set(key, { cred, at });
  }

  private keyOf(
    workspaceId: string,
    provider: string,
    acting: CredentialActing | undefined,
  ): string {
    return `${workspaceId}:${credentialScopeKey(acting)}:${provider}`;
  }
}

/**
 * The process-wide refresher. One instance, so every serve of the same
 * credential lands in the same flight — a per-request coalescer would coalesce
 * nothing.
 */
export const sharedCredentialRefresher = new CredentialRefreshCoalescer();
