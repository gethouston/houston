import type { IntegrationProviderId } from "@houston/protocol";
import type {
  ActionDescription,
  FileUploadRequest,
  FileUploadSlot,
} from "./file-args";
import type {
  ActingContext,
  IntegrationProvider,
  ProviderSearchResult,
} from "./provider";
import {
  type ActionResult,
  type Connection,
  type ConnectStart,
  IntegrationSigninRequiredError,
  integrationUpstreamErrorFromResponse,
  isIntegrationAppStatus,
  type ProviderReadiness,
  statusFromConnected,
  type Toolkit,
  type ToolMatch,
} from "./types";

function readSearchItem(raw: ToolMatch): ToolMatch {
  const status = isIntegrationAppStatus(raw.status)
    ? raw.status
    : statusFromConnected(raw.connected);
  return { ...raw, status };
}

export interface RemoteIntegrationOptions {
  id: IntegrationProviderId;
  upstreamUrl: string;
  token: () => string | null;
  podToken?: string;
  fetch?: typeof fetch;
}

export class RemoteIntegrationProvider implements IntegrationProvider {
  readonly id: IntegrationProviderId;
  private readonly upstreamUrl: string;
  private readonly token: () => string | null;
  private readonly podToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RemoteIntegrationOptions) {
    this.id = opts.id;
    this.upstreamUrl = opts.upstreamUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.podToken = opts.podToken;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private authHeaders(acting?: ActingContext): Record<string, string> {
    if (acting?.actingAs) {
      return { authorization: `Bearer ${acting.actingAs}` };
    }
    if (acting?.actingUser && this.podToken) {
      return {
        authorization: `Bearer ${this.podToken}`,
        "x-houston-acting-user": acting.actingUser,
      };
    }
    const token = this.token();
    if (!token) throw new IntegrationSigninRequiredError();
    return { authorization: `Bearer ${token}` };
  }

  async readiness(): Promise<ProviderReadiness> {
    return this.token() ? { ready: true } : { ready: false, reason: "signin" };
  }

  private async call<T>(
    path: string,
    opts: {
      method?: "GET" | "POST";
      body?: unknown;
      acting?: ActingContext;
      nullStatuses?: number[];
    } = {},
  ): Promise<T | null> {
    const auth = this.authHeaders(opts.acting);

    const res = await this.fetchImpl(
      `${this.upstreamUrl}/v1/integrations/${encodeURIComponent(this.id)}${path}`,
      {
        method: opts.method ?? "GET",
        headers: {
          ...auth,
          ...(opts.body !== undefined
            ? { "content-type": "application/json" }
            : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      },
    );
    if (res.status === 401) throw new IntegrationSigninRequiredError();
    if (opts.nullStatuses?.includes(res.status)) return null;
    if (!res.ok)
      throw await integrationUpstreamErrorFromResponse(
        res,
        `integrations gateway ${opts.method ?? "GET"} ${path}`,
      );
    return (await res.json()) as T;
  }

  private must<T>(body: T | null, what: string): T {
    if (body === null)
      throw new Error(`integrations gateway returned no body for ${what}`);
    return body;
  }

  async listToolkits(): Promise<Toolkit[]> {
    const body = await this.call<{ items: Toolkit[] }>("/toolkits");
    return this.must(body, "GET /toolkits").items;
  }

  async listConnections(_userId: string): Promise<Connection[]> {
    const body = await this.call<{ items: Connection[] }>("/connections");
    return this.must(body, "GET /connections").items;
  }

  async connect(_userId: string, toolkit: string): Promise<ConnectStart> {
    const body = await this.call<ConnectStart>("/connect", {
      method: "POST",
      body: { toolkit },
    });
    return this.must(body, "POST /connect");
  }

  async connection(
    _userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    return this.call<Connection>(
      `/connections/${encodeURIComponent(connectionId)}`,
      { nullStatuses: [404] },
    );
  }

  async disconnect(
    _userId: string,
    toolkit: string,
    connectionId?: string,
  ): Promise<void> {
    await this.call("/disconnect", {
      method: "POST",
      body: { toolkit, ...(connectionId ? { connectionId } : {}) },
    });
  }

  async search(
    _userId: string,
    query: string,
    acting?: ActingContext,
    app?: string,
  ): Promise<ProviderSearchResult> {
    const body = await this.call<{ items: ToolMatch[]; scoped?: boolean }>(
      "/search",
      {
        method: "POST",
        body: { query, ...(app ? { app } : {}) },
        acting,
      },
    );
    const parsed = this.must(body, "POST /search");
    const items = parsed.items.map(readSearchItem);
    if (!app) return { items };
    const scope =
      parsed.scoped === true
        ? "resolved"
        : parsed.scoped === false
          ? "unresolved"
          : "ignored";
    return { items, scope };
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
    acting?: ActingContext,
    account?: string,
  ): Promise<ActionResult> {
    const body = await this.call<ActionResult>("/execute", {
      method: "POST",
      body: { action, params, ...(account ? { account } : {}) },
      acting,
    });
    return this.must(body, "POST /execute");
  }

  async describeAction(
    _userId: string,
    action: string,
    acting?: ActingContext,
  ): Promise<ActionDescription | null> {
    return this.call<ActionDescription>(
      `/actions/${encodeURIComponent(action)}`,
      { acting, nullStatuses: [404] },
    );
  }

  async reserveFileUpload(
    _userId: string,
    req: FileUploadRequest,
    acting?: ActingContext,
  ): Promise<FileUploadSlot> {
    const { action, filename, mimetype, md5 } = req;
    const body = await this.call<FileUploadSlot>("/files/upload-request", {
      method: "POST",
      body: { action, filename, mimetype, md5 },
      acting,
    });
    return this.must(body, "POST /files/upload-request");
  }
}
