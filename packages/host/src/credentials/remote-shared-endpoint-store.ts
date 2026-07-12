export interface SharedEndpointInput {
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  apiKey?: string;
}

export interface OrgSharedEndpoint {
  baseUrl: string;
  model: string;
  name: string | null;
  contextWindow: number | null;
  reasoning: boolean;
  apiKey: string;
  ownerAgent: string;
}

export interface SharedEndpointStore {
  get(): Promise<OrgSharedEndpoint | null>;
  put(endpoint: SharedEndpointInput): Promise<void>;
  remove(opts: { ownerOnly: boolean }): Promise<void>;
}

export interface RemoteSharedEndpointStoreOptions {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
  fetchImpl?: typeof fetch;
}

/** Managed-pod client for the gateway's single organization endpoint share. */
export class RemoteSharedEndpointStore implements SharedEndpointStore {
  private readonly baseUrl: string;
  private readonly orgSlug: string;
  private readonly agentSlug: string;
  private readonly podToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RemoteSharedEndpointStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.orgSlug = opts.orgSlug;
    this.agentSlug = opts.agentSlug;
    this.podToken = opts.podToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async get(): Promise<OrgSharedEndpoint | null> {
    const res = await this.fetchImpl(this.url(), {
      headers: this.authHeaders(),
    });
    if (res.status === 404) return null;
    if (res.status !== 200) throw await this.errorFromResponse(res, "GET");
    return (await res.json()) as OrgSharedEndpoint;
  }

  async put(endpoint: SharedEndpointInput): Promise<void> {
    const res = await this.fetchImpl(this.url(), {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(endpoint),
    });
    if (res.status !== 200) throw await this.errorFromResponse(res, "PUT");
  }

  async remove(opts: { ownerOnly: boolean }): Promise<void> {
    const res = await this.fetchImpl(this.url(), {
      method: "DELETE",
      headers: this.authHeaders(
        opts.ownerOnly ? { "x-houston-owner-only": "1" } : {},
      ),
    });
    if (res.status !== 200) throw await this.errorFromResponse(res, "DELETE");
  }

  private url(): string {
    return `${this.baseUrl}/v1/pod/shared-endpoint/${encodeURIComponent(this.orgSlug)}/${encodeURIComponent(this.agentSlug)}`;
  }

  private authHeaders(
    extra: Record<string, string> = {},
  ): Record<string, string> {
    return { Authorization: `Bearer ${this.podToken}`, ...extra };
  }

  private async errorFromResponse(res: Response, method: string) {
    const body = await res.text().catch(() => "");
    return new Error(
      `shared endpoint gateway ${method} failed (${res.status})${
        body ? `: ${body.slice(0, 200)}` : ""
      }`,
    );
  }
}
