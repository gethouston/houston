import type { WorkspaceId } from "../domain/types";
import {
  type CredentialStore,
  isApiKeyCredential,
  type WorkspaceCredential,
} from "../ports";
import {
  credentialFromGateway,
  type GatewayCredential,
  isNotConnected404,
} from "./gateway-wire";

const CACHE_TTL_MS = 15_000;
type CachedCredential = Omit<WorkspaceCredential, "workspaceId">;

export interface RemoteCredentialStoreOptions {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
  fallback?: CredentialStore;
  fetchImpl?: typeof fetch;
}

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
  }

  async get(
    workspaceId: WorkspaceId,
    provider: string,
  ): Promise<WorkspaceCredential | null> {
    const cached = this.cache.get(provider);
    if (cached && cached.until > Date.now())
      return this.withWorkspace(workspaceId, cached.value);

    const remote = await this.fetchRemote(provider);
    if (remote) {
      this.cache.set(provider, this.cacheEntry(remote));
      return this.withWorkspace(workspaceId, remote);
    }

    const adopted = await this.adoptFallback(workspaceId, provider);
    this.cache.set(provider, this.cacheEntry(adopted));
    return this.withWorkspace(workspaceId, adopted);
  }

  async put(cred: WorkspaceCredential): Promise<void> {
    await this.putRemote(cred.provider, cred);
    this.cache.delete(cred.provider);
  }

  async remove(workspaceId: WorkspaceId, provider: string): Promise<void> {
    const res = await this.fetchImpl(this.url(provider), {
      method: "DELETE",
      headers: this.authHeaders(),
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
    await this.fallback?.remove(workspaceId, provider);
    this.cache.delete(provider);
  }

  private async adoptFallback(
    workspaceId: WorkspaceId,
    provider: string,
  ): Promise<CachedCredential | null> {
    const local = await this.fallback?.get(workspaceId, provider);
    if (!local) return null;

    await this.putRemote(provider, local, { ifAbsent: true });
    return await this.fetchRemote(provider);
  }

  private async fetchRemote(
    provider: string,
  ): Promise<CachedCredential | null> {
    const res = await this.fetchImpl(this.url(provider), {
      headers: this.authHeaders(),
    });
    if (await isNotConnected404(res)) return null;
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
    opts: { ifAbsent?: boolean } = {},
  ): Promise<void> {
    const res = await this.fetchImpl(this.url(provider), {
      method: "PUT",
      headers: this.authHeaders({
        "content-type": "application/json",
        ...(opts.ifAbsent ? { "x-houston-if-absent": "1" } : {}),
      }),
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
  ): Record<string, string> {
    return { Authorization: `Bearer ${this.podToken}`, ...extra };
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
