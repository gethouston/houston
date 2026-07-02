import type { IntegrationProvider } from "./provider";
import {
  type ActionResult,
  type Connection,
  type ConnectStart,
  IntegrationSigninRequiredError,
  type ProviderReadiness,
  type Toolkit,
  type ToolMatch,
} from "./types";

/**
 * The gateway adapter — the desktop's IntegrationProvider. The platform API key
 * must never ship in a client binary (anyone could extract it and execute tools
 * as any user_id), so the local host holds NO provider key: every port call is
 * forwarded to Houston's cloud host `/v1/integrations/*` routes with the user's
 * Supabase session token. The upstream verifies the JWT and derives the Composio
 * `user_id` from its `sub` — a client can never act as someone else, and a
 * user's connections follow them across desktop and cloud.
 *
 * The `userId` parameters of the port are therefore ignored here: the upstream
 * re-derives identity from the token it verifies, which is the whole point.
 *
 * The frontend keeps `token()` fresh (it owns the Supabase session + refresh);
 * with no session the adapter reports not-ready and throws a typed
 * signin-required error, which the routes surface as an actionable 409.
 */

export interface RemoteIntegrationOptions {
  /** Provider id served upstream (and reported locally), e.g. "composio". */
  id: string;
  /** Base URL of Houston's cloud host, e.g. "https://engine.gethouston.ai". */
  upstreamUrl: string;
  /** The user's current Supabase access token; null when signed out. */
  token: () => string | null;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export class RemoteIntegrationProvider implements IntegrationProvider {
  readonly id: string;
  private readonly upstreamUrl: string;
  private readonly token: () => string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RemoteIntegrationOptions) {
    this.id = opts.id;
    this.upstreamUrl = opts.upstreamUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async readiness(): Promise<ProviderReadiness> {
    return this.token() ? { ready: true } : { ready: false, reason: "signin" };
  }

  private async call<T>(
    path: string,
    opts: { method?: "GET" | "POST"; body?: unknown } = {},
  ): Promise<T> {
    const token = this.token();
    if (!token) throw new IntegrationSigninRequiredError();

    const res = await this.fetchImpl(
      `${this.upstreamUrl}/v1/integrations/${encodeURIComponent(this.id)}${path}`,
      {
        method: opts.method ?? "GET",
        headers: {
          authorization: `Bearer ${token}`,
          ...(opts.body !== undefined
            ? { "content-type": "application/json" }
            : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      },
    );
    if (res.status === 401) throw new IntegrationSigninRequiredError();
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `integrations gateway ${opts.method ?? "GET"} ${path} → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      );
    }
    return (await res.json()) as T;
  }

  async listToolkits(): Promise<Toolkit[]> {
    const body = await this.call<{ items: Toolkit[] }>("/toolkits");
    return body.items;
  }

  async listConnections(_userId: string): Promise<Connection[]> {
    const body = await this.call<{ items: Connection[] }>("/connections");
    return body.items;
  }

  async connect(_userId: string, toolkit: string): Promise<ConnectStart> {
    return this.call<ConnectStart>("/connect", {
      method: "POST",
      body: { toolkit },
    });
  }

  async connection(
    _userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    const token = this.token();
    if (!token) throw new IntegrationSigninRequiredError();
    const res = await this.fetchImpl(
      `${this.upstreamUrl}/v1/integrations/${encodeURIComponent(this.id)}/connections/${encodeURIComponent(connectionId)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (res.status === 404) return null;
    if (res.status === 401) throw new IntegrationSigninRequiredError();
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `integrations gateway GET /connections/:id → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      );
    }
    return (await res.json()) as Connection;
  }

  async disconnect(_userId: string, toolkit: string): Promise<void> {
    await this.call("/disconnect", { method: "POST", body: { toolkit } });
  }

  async search(_userId: string, query: string): Promise<ToolMatch[]> {
    const body = await this.call<{ items: ToolMatch[] }>("/search", {
      method: "POST",
      body: { query },
    });
    return body.items;
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    return this.call<ActionResult>("/execute", {
      method: "POST",
      body: { action, params },
    });
  }
}
