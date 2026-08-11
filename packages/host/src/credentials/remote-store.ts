import type { WorkspaceId } from "../domain/types";
import {
  type CredentialActing,
  type CredentialStore,
  isApiKeyCredential,
  type WorkspaceCredential,
} from "../ports";
import {
  credentialFromGateway,
  type GatewayCredential,
  isNotConnected404,
} from "./gateway-wire";
import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "./revocation-tombstones";
import { credentialScopeKey } from "./scope-key";

const CACHE_TTL_MS = 15_000;
type CachedCredential = Omit<WorkspaceCredential, "workspaceId">;

export interface RemoteCredentialStoreOptions {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
  fallback?: CredentialStore;
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to the process-wide ledger. */
  revocations?: RevocationTombstones;
}

/** The gateway positively identified the stored credential as unusable. */
export class RemoteCredentialDeadError extends Error {}

/**
 * Managed-pod credential store: the pod never owns refresh-token rotation. The
 * gateway is the single refresher for org credentials (OpenAI refresh tokens
 * rotate), and pods fetch only access/API-key material just-in-time. Only the
 * gateway's own "not connected" 404 (JSON error body — see isNotConnected404)
 * means logged out; every other failure, including a route-level 404 from a
 * misdeployed gateway, must throw so the runtime keeps its last hydrated token
 * instead of logging the org out locally.
 */
export class RemoteCredentialStore implements CredentialStore {
  private readonly baseUrl: string;
  private readonly orgSlug: string;
  private readonly agentSlug: string;
  private readonly podToken: string;
  private readonly fallback?: CredentialStore;
  private readonly fetchImpl: typeof fetch;
  private readonly revocations: RevocationTombstones;
  private readonly cache = new Map<
    string,
    { until: number; value: CachedCredential | null }
  >();

  constructor(opts: RemoteCredentialStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.orgSlug = opts.orgSlug;
    this.agentSlug = opts.agentSlug;
    this.podToken = opts.podToken;
    this.fallback = opts.fallback;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.revocations = opts.revocations ?? sharedRevocationTombstones;
  }

  async get(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<WorkspaceCredential | null> {
    const cacheKey = scopeKeyOf(acting, provider);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.until > Date.now())
      return this.withWorkspace(workspaceId, cached.value);

    const remote = await this.fetchRemote(provider, acting);
    if (remote) {
      this.cache.set(cacheKey, this.cacheEntry(remote));
      return this.withWorkspace(workspaceId, remote);
    }

    const adopted = acting?.actingAs
      ? null
      : await this.adoptFallback(workspaceId, provider);
    this.cache.set(cacheKey, this.cacheEntry(adopted));
    return this.withWorkspace(workspaceId, adopted);
  }

  async put(
    cred: WorkspaceCredential,
    opts?: { ifAbsent?: boolean } & CredentialActing,
  ): Promise<void> {
    // ifAbsent rides to the gateway as `x-houston-if-absent`, whose PUT is
    // atomic under the per-(org, provider) row lock — the authoritative guard
    // against clobbering a live rotated refresh token with a cached snapshot.
    await this.putRemote(cred.provider, cred, {
      ifAbsent: opts?.ifAbsent,
      acting: opts,
    });
    this.cache.delete(scopeKeyOf(opts, cred.provider));
  }

  async remove(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<void> {
    const res = await this.fetchImpl(this.url(provider), {
      method: "DELETE",
      headers: this.authHeaders({}, acting),
    });
    // Sign-out is idempotent, like the file store: the gateway's "not
    // connected" 404 means the row is already gone (another pod removed it, or
    // this provider was never adopted) — callers forget credential siblings
    // unconditionally and rely on the no-op.
    if (res.status !== 200 && !(await isNotConnected404(res)))
      throw await this.errorFromResponse(res, "DELETE", provider);
    // Clear the legacy adoption source too — leaving the file entry would let
    // the next get()'s 404-adoption silently resurrect the credential the user
    // just removed, org-wide.
    if (!acting?.actingAs) await this.fallback?.remove(workspaceId, provider);
    this.cache.delete(scopeKeyOf(acting, provider));
  }

  /**
   * Report a token the PROVIDER revoked: the gateway drops its row only while
   * that token is still the stored one (HOU-952). Rides the same DELETE with
   * `x-houston-if-access-sha256`, so the comparison happens under the gateway's
   * per-(org, provider) row lock rather than as a read-then-delete here — a
   * reconnect racing the report waits behind it instead of being deleted by it.
   *
   * Returns whether the gateway actually removed anything. A `removed:false`
   * is the ordinary superseded case (the org reconnected, or a sibling pod
   * reported the same dead token first), not a failure.
   */
  async removeIfAccess(
    workspaceId: WorkspaceId,
    provider: string,
    accessSha256: string,
    opts?: { scope?: "personal" | "team" } & CredentialActing,
  ): Promise<boolean> {
    const res = await this.fetchImpl(this.url(provider), {
      method: "DELETE",
      // The scope says WHICH kind of row; the acting header (authHeaders) says
      // WHOSE. A personal row is keyed by (org, user, provider), so without the
      // acting identity the gateway cannot address it and refuses the report.
      headers: this.authHeaders(
        {
          ...(opts?.scope ? { "x-houston-credential-scope": opts.scope } : {}),
          "x-houston-if-access-sha256": accessSha256,
        },
        opts,
      ),
    });
    // Idempotent like remove(): an already-gone row is the outcome we wanted.
    if (res.status !== 200 && !(await isNotConnected404(res)))
      throw await this.errorFromResponse(res, "DELETE", provider);
    const removed =
      res.status === 200 &&
      ((await res.json().catch(() => null)) as { removed?: boolean } | null)
        ?.removed === true;
    // Only a real removal invalidates local state. Leaving the cache and the
    // legacy fallback entry alone on a superseded report is deliberate: they
    // may describe the credential that SUPERSEDED the revoked one.
    if (removed) {
      // Only the REPORTING identity's entry. Evicting every member's key would
      // cost every other member of this pod a gateway round-trip for a row that
      // is still theirs and still live.
      this.cache.delete(scopeKeyOf(opts, provider));
      if (opts?.scope !== "personal")
        await this.fallback?.remove(workspaceId, provider);
    }
    return removed;
  }

  private async adoptFallback(
    workspaceId: WorkspaceId,
    provider: string,
  ): Promise<CachedCredential | null> {
    // A gateway row deleted because the PROVIDER revoked the credential must
    // not be refilled from the legacy local file — that copy is the same dead
    // family, and re-adopting it re-fails the next turn into another revoked
    // report (HOUSTON-APP-530). removeIfAccess clears this pod's fallback, but
    // a sibling pod's file (or a remove that raced) can still hold the entry.
    if (this.revocations.active({ workspaceId, provider })) return null;
    const local = await this.fallback?.get(workspaceId, provider);
    if (!local) return null;

    await this.putRemote(provider, local, { ifAbsent: true });
    return await this.fetchRemote(provider);
  }

  private async fetchRemote(
    provider: string,
    acting?: CredentialActing,
  ): Promise<CachedCredential | null> {
    const res = await this.fetchImpl(this.url(provider), {
      headers: this.authHeaders({}, acting),
    });
    if (await isNotConnected404(res)) return null;
    if (res.status === 502) {
      const body = await res
        .clone()
        .text()
        .catch(() => "");
      if (
        /refresh|credential.*(dead|expired|invalid|reject)|session.*ended/i.test(
          body,
        )
      )
        throw new RemoteCredentialDeadError(
          `credential gateway GET ${provider} reported a dead credential`,
        );
    }
    if (res.status !== 200)
      throw await this.errorFromResponse(res, "GET", provider);

    return credentialFromGateway(
      provider,
      (await res.json()) as GatewayCredential,
    );
  }

  private async putRemote(
    provider: string,
    cred: WorkspaceCredential,
    opts: { ifAbsent?: boolean; acting?: CredentialActing } = {},
  ): Promise<void> {
    const res = await this.fetchImpl(this.url(provider), {
      method: "PUT",
      headers: this.authHeaders(
        {
          "content-type": "application/json",
          ...(opts.ifAbsent ? { "x-houston-if-absent": "1" } : {}),
        },
        opts.acting,
      ),
      body: JSON.stringify({
        kind: isApiKeyCredential(cred) ? "api_key" : "oauth",
        access: cred.accessToken,
        refresh: cred.refreshToken,
        expires: cred.expiresAt,
        ...(cred.accountId !== undefined ? { accountId: cred.accountId } : {}),
        ...(cred.enterpriseUrl !== undefined
          ? { enterpriseUrl: cred.enterpriseUrl }
          : {}),
      }),
    });
    if (res.status !== 200)
      throw await this.errorFromResponse(res, "PUT", provider);
  }

  private withWorkspace(
    workspaceId: WorkspaceId,
    value: CachedCredential | null,
  ): WorkspaceCredential | null {
    return value ? { workspaceId, ...value } : null;
  }

  private cacheEntry(value: CachedCredential | null) {
    return { value, until: Date.now() + CACHE_TTL_MS };
  }

  private url(provider: string): string {
    return `${this.baseUrl}/v1/pod/credentials/${encodeURIComponent(this.orgSlug)}/${encodeURIComponent(this.agentSlug)}/${encodeURIComponent(provider)}`;
  }

  private authHeaders(
    extra: Record<string, string> = {},
    acting?: CredentialActing,
  ): Record<string, string> {
    return {
      Authorization: `Bearer ${this.podToken}`,
      ...(acting?.actingAs ? { "x-houston-acting-as": acting.actingAs } : {}),
      ...extra,
    };
  }

  private async errorFromResponse(
    res: Response,
    method: string,
    provider: string,
  ): Promise<Error> {
    const body = await res.text().catch(() => "");
    return new Error(
      `credential gateway ${method} ${provider} failed (${res.status})${
        body ? `: ${body.slice(0, 200)}` : ""
      }`,
    );
  }
}

/**
 * The cache key for one (acting identity, provider). The identity half is the
 * SHARED scope derivation (credentials/scope-key.ts), so this adapter and the
 * local ones resolve the same member to the same row. Exported for its test.
 */
export function scopeKeyOf(
  acting: CredentialActing | undefined,
  provider: string,
): string {
  return `${credentialScopeKey(acting)}|${provider}`;
}
