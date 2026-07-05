import type { WorkspaceId } from "../domain/types";
import {
  type CredentialStore,
  isApiKeyCredential,
  type WorkspaceCredential,
} from "../ports";

const CACHE_TTL_MS = 15_000;
type CachedCredential = Omit<WorkspaceCredential, "workspaceId">;

interface GatewayCredential {
  provider: string;
  kind: "oauth" | "api_key";
  access: string;
  expires: number;
  accountId?: string | null;
  enterpriseUrl?: string | null;
}
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
 * rotate), and pods fetch only access/API-key material just-in-time. A 404 is the
 * authoritative "not connected" signal; transport/5xx errors must throw so the
 * runtime keeps its last hydrated token instead of logging the org out locally.
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

  async remove(_workspaceId: WorkspaceId, provider: string): Promise<void> {
    const res = await this.fetchImpl(this.url(provider), {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (res.status !== 200)
      throw await this.errorFromResponse(res, "DELETE", provider);
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
    if (res.status === 404) return null;
    if (res.status !== 200)
      throw await this.errorFromResponse(res, "GET", provider);

    return this.fromGateway(provider, (await res.json()) as GatewayCredential);
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

  private fromGateway(
    provider: string,
    body: GatewayCredential,
  ): CachedCredential {
    if (
      body.provider !== provider ||
      (body.kind !== "oauth" && body.kind !== "api_key") ||
      typeof body.access !== "string" ||
      typeof body.expires !== "number"
    ) {
      throw new Error(`credential gateway returned malformed ${provider} body`);
    }
    return {
      provider: body.provider,
      kind: body.kind,
      accessToken: body.access,
      refreshToken: "",
      expiresAt: body.expires,
      ...(typeof body.accountId === "string"
        ? { accountId: body.accountId }
        : {}),
      ...(typeof body.enterpriseUrl === "string"
        ? { enterpriseUrl: body.enterpriseUrl }
        : {}),
    };
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
