import { deadGoogleApiKey } from "@houston/protocol/google-key";
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
  gatewayBlockedDetail,
  RemoteCredentialBlockedError,
} from "./remote-blocked";
import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "./revocation-tombstones";
import { credentialScopeKey } from "./scope-key";

export { RemoteCredentialBlockedError } from "./remote-blocked";

const CACHE_TTL_MS = 15_000;
type CachedCredential = Omit<WorkspaceCredential, "workspaceId">;

export interface RemoteCredentialStoreOptions {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
  fallback?: CredentialStore;
  fetchImpl?: typeof fetch;
  revocations?: RevocationTombstones;
}

export class RemoteCredentialDeadError extends Error {}

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

  invalidate(provider: string, acting?: CredentialActing): void {
    this.cache.delete(scopeKeyOf(acting, provider));
  }

  async put(
    cred: WorkspaceCredential,
    opts?: { ifAbsent?: boolean } & CredentialActing,
  ): Promise<void> {
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
    if (res.status !== 200 && !(await isNotConnected404(res)))
      throw await this.errorFromResponse(res, "DELETE", provider);
    if (!acting?.actingAs) await this.fallback?.remove(workspaceId, provider);
    this.cache.delete(scopeKeyOf(acting, provider));
  }

  async removeIfAccess(
    workspaceId: WorkspaceId,
    provider: string,
    accessSha256: string,
    opts?: { scope?: "personal" | "team" } & CredentialActing,
  ): Promise<boolean> {
    const res = await this.fetchImpl(this.url(provider), {
      method: "DELETE",
      headers: this.authHeaders(
        {
          ...(opts?.scope ? { "x-houston-credential-scope": opts.scope } : {}),
          "x-houston-if-access-sha256": accessSha256,
        },
        opts,
      ),
    });
    if (res.status !== 200 && !(await isNotConnected404(res)))
      throw await this.errorFromResponse(res, "DELETE", provider);
    const removed =
      res.status === 200 &&
      ((await res.json().catch(() => null)) as { removed?: boolean } | null)
        ?.removed === true;
    if (removed) {
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
    if (this.revocations.active({ workspaceId, provider })) return null;
    const local = await this.fallback?.get(workspaceId, provider);
    if (!local) return null;
    if (deadStoredApiKey(local)) {
      console.warn(
        `[credentials] refusing to adopt the legacy ${provider} credential — an OAuth-type token, not an API key; removing it`,
      );
      await this.fallback?.remove(workspaceId, provider);
      return null;
    }

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
      const blocked = gatewayBlockedDetail(body);
      if (blocked !== null)
        throw new RemoteCredentialBlockedError(provider, blocked);
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
    if (deadStoredApiKey(cred))
      throw new Error(
        `refusing to store a ${provider} credential that is not an API key (an OAuth-type token can never authenticate)`,
      );
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

export function scopeKeyOf(
  acting: CredentialActing | undefined,
  provider: string,
): string {
  return `${credentialScopeKey(acting)}|${provider}`;
}

function deadStoredApiKey(cred: WorkspaceCredential): boolean {
  return deadGoogleApiKey({
    provider: cred.provider,
    kind: isApiKeyCredential(cred) ? "api_key" : "oauth",
    access: cred.accessToken,
  });
}
