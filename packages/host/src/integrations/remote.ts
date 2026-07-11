import type { ActingContext, IntegrationProvider } from "./provider";
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

/**
 * Read one search item from the gateway TOLERANTLY: a valid `status` (a later
 * gateway that annotates `blocked`, etc.) passes through untouched; an absent or
 * unrecognized `status` (today's gateway) derives from the legacy `connected`
 * boolean. The new field is never required — the desktop keeps working against
 * an old gateway, and a new gateway lights up `blocked` here with no change.
 */
function readSearchItem(raw: ToolMatch): ToolMatch {
  const status = isIntegrationAppStatus(raw.status)
    ? raw.status
    : statusFromConnected(raw.connected);
  return { ...raw, status };
}

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
 *
 * Acting-as (C2, cloud pods only): when a `search`/`execute` carries an
 * `ActingContext`, per-call auth takes precedence over the frontend session in
 * this order — (a) `actingAs` token → `Authorization: Bearer <token>`; else
 * (b) `actingUser` + a configured `podToken` → `Authorization: Bearer <podToken>`
 * plus `x-houston-acting-user: <sub>` (the routine path); else (c) today's
 * behavior (the frontend session token, else the typed signin-required error).
 * The desktop configures no `podToken`, so it never reaches mode (b).
 */

export interface RemoteIntegrationOptions {
  /** Provider id served upstream (and reported locally), e.g. "composio". */
  id: string;
  /** Base URL of Houston's cloud host, e.g. "https://engine.gethouston.ai". */
  upstreamUrl: string;
  /** The user's current Supabase access token; null when signed out. */
  token: () => string | null;
  /**
   * This managed pod's own host token (env `HOUSTON_HOST_TOKEN`), enabling the
   * routine acting-user auth mode. Absent on the desktop (no pod token exists),
   * so a routine turn there falls through to signin-required rather than
   * authenticating as the pod. */
  podToken?: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export class RemoteIntegrationProvider implements IntegrationProvider {
  readonly id: string;
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

  /**
   * Resolve the auth headers for one call given the optional acting context
   * (C2 precedence). Throws the typed signin error when nothing can authenticate
   * — surfaced to the runtime as an actionable 409. Kept separate so `search` /
   * `execute` (the only acting-aware calls) share it and the userId-derived
   * management calls keep using the frontend session directly.
   */
  private authHeaders(acting?: ActingContext): Record<string, string> {
    // (a) A per-turn acting-as token authenticates AS that user upstream.
    if (acting?.actingAs) {
      return { authorization: `Bearer ${acting.actingAs}` };
    }
    // (b) A routine turn: no per-turn token, so present the pod's own token and
    //     name the routine creator the gateway must resolve + authorize.
    if (acting?.actingUser && this.podToken) {
      return {
        authorization: `Bearer ${this.podToken}`,
        "x-houston-acting-user": acting.actingUser,
      };
    }
    // (c) Today's behavior: the frontend-pushed session token, else signin.
    const token = this.token();
    if (!token) throw new IntegrationSigninRequiredError();
    return { authorization: `Bearer ${token}` };
  }

  async readiness(): Promise<ProviderReadiness> {
    return this.token() ? { ready: true } : { ready: false, reason: "signin" };
  }

  /**
   * One authenticated upstream call. 401 → the typed signin error; a status in
   * `nullStatuses` → null (e.g. a connection poll's 404 — same pattern as
   * ComposioHttp.call); any other !ok relays the upstream status + body.
   */
  private async call<T>(
    path: string,
    opts: {
      method?: "GET" | "POST";
      body?: unknown;
      acting?: ActingContext;
      /** Treat these statuses as "no" rather than an error (e.g. 404 → null). */
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

  /** Unwrap a call that passed no `nullStatuses` — null there is impossible;
   *  guard it loudly rather than cast it away. */
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
    // A vanished/unknown connection is a normal poll outcome, not an error.
    return this.call<Connection>(
      `/connections/${encodeURIComponent(connectionId)}`,
      { nullStatuses: [404] },
    );
  }

  async disconnect(_userId: string, toolkit: string): Promise<void> {
    await this.call("/disconnect", { method: "POST", body: { toolkit } });
  }

  async search(
    _userId: string,
    query: string,
    acting?: ActingContext,
  ): Promise<ToolMatch[]> {
    const body = await this.call<{ items: ToolMatch[] }>("/search", {
      method: "POST",
      body: { query },
      acting,
    });
    return this.must(body, "POST /search").items.map(readSearchItem);
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
    acting?: ActingContext,
  ): Promise<ActionResult> {
    const body = await this.call<ActionResult>("/execute", {
      method: "POST",
      body: { action, params },
      acting,
    });
    return this.must(body, "POST /execute");
  }
}
