import { resolveAuthConfig } from "./composio-auth-config";
import { ComposioHttp } from "./composio-http";
import { searchComposio } from "./composio-search";
import {
  mapConnection,
  mapExecute,
  mapTool,
  mapToolkit,
  type RawConnection,
  type RawExecute,
  type RawTool,
  type RawToolkit,
} from "./composio-wire";
import type { ActingContext, IntegrationProvider } from "./provider";
import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
  ToolMatch,
} from "./types";

/**
 * The Composio adapter — the first IntegrationProvider. Speaks Composio's v3
 * REST API directly (no bundled CLI, no SDK): the platform model, where Houston
 * holds ONE project API key (`x-api-key`) and each Houston user is a plain
 * `user_id` under that project. Users never create a Composio account — they
 * only OAuth the app itself (Gmail, Slack…), and Composio hosts that dance.
 *
 * Connect uses `POST /api/v3.1/connected_accounts/link` (the legacy
 * `POST /api/v3/connected_accounts` initiate is retired for Composio-managed
 * OAuth as of 2026-07: it 400s for orgs created after 2026-05-08). Auth configs
 * are resolved per toolkit on demand: reuse the project's existing config, else
 * create one on Composio-managed auth — no manual dashboard step per toolkit.
 *
 * This adapter runs wherever the key legitimately lives: the cloud host and
 * self-hosted servers (the operator's own key). The desktop instead wires the
 * gateway adapter (see remote.ts) — the platform key never ships in a client.
 */

const DEFAULT_BASE_URL = "https://backend.composio.dev";

/** The toolkits catalog is large-ish and changes rarely — cache it per process
 *  for search's name resolution so a hot session does not refetch ~1000 apps. */
const CATALOG_TTL_MS = 60 * 60 * 1000;

export interface ComposioOptions {
  /** Houston's Composio PROJECT API key (dashboard → Project Settings). */
  apiKey: string;
  /** Override for tests / self-host pointing at a different Composio backend. */
  baseURL?: string;
  /** Where Composio sends the user's browser after they finish an app OAuth. */
  callbackUrl?: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export class ComposioProvider implements IntegrationProvider {
  readonly id = "composio";
  private readonly http: ComposioHttp;
  private readonly callbackUrl?: string;
  /** toolkit slug → auth-config id (`ac_…`), resolved once per process. */
  private readonly authConfigs = new Map<string, string>();
  /** In-process toolkits-catalog cache for search's name resolution. */
  private catalogCache?: { at: number; toolkits: Toolkit[] };
  private catalogInflight?: Promise<Toolkit[]>;

  constructor(opts: ComposioOptions) {
    if (!opts.apiKey) throw new Error("composio: missing platform api key");
    this.http = new ComposioHttp(
      opts.apiKey,
      (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
      opts.fetch ?? fetch,
    );
    this.callbackUrl = opts.callbackUrl;
  }

  /** Direct adapter = the key is here, so it can always serve. */
  async readiness(): Promise<ProviderReadiness> {
    return { ready: true };
  }

  private async fetchToolkits(): Promise<Toolkit[]> {
    const body = await this.http.call<{ items?: RawToolkit[] }>(
      "/api/v3/toolkits",
      {
        query: { limit: "1000" },
      },
    );
    // no_auth toolkits (web search, weather…) stay in the catalog but carry
    // the flag: there is no account to connect (creating an auth config 400s
    // upstream — Auth_Config_NoAuthApp, seen in prod), yet their tools work
    // as-is. The UI renders them "ready to use" instead of connectable, and
    // search stamps their matches `connected` (see composio-search.ts).
    return (body?.items ?? []).map(mapToolkit);
  }

  async listToolkits(): Promise<Toolkit[]> {
    // The UI wants the freshest catalog; search uses the cached copy instead.
    return this.fetchToolkits();
  }

  /** The catalog for search's name resolution: cached per process (TTL), with a
   *  shared in-flight promise so a burst of searches fetches it at most once. */
  private async cachedCatalog(): Promise<Toolkit[]> {
    const fresh =
      this.catalogCache && Date.now() - this.catalogCache.at < CATALOG_TTL_MS;
    if (this.catalogCache && fresh) return this.catalogCache.toolkits;
    if (this.catalogInflight) return this.catalogInflight;
    this.catalogInflight = this.fetchToolkits()
      .then((toolkits) => {
        this.catalogCache = { at: Date.now(), toolkits };
        return toolkits;
      })
      .finally(() => {
        this.catalogInflight = undefined;
      });
    return this.catalogInflight;
  }

  async listConnections(userId: string): Promise<Connection[]> {
    const body = await this.http.call<{ items?: RawConnection[] }>(
      "/api/v3/connected_accounts",
      { query: { user_ids: userId, limit: "100" } },
    );
    return (body?.items ?? []).map(mapConnection);
  }

  /**
   * Start connecting a toolkit: mint an auth-link session — Composio hosts the
   * OAuth dance and the user authorizes the APP (Gmail…), never Composio. The
   * returned connectionId is polled via connection() until it turns active.
   */
  async connect(userId: string, toolkit: string): Promise<ConnectStart> {
    const authConfigId = await resolveAuthConfig(
      this.http,
      this.authConfigs,
      toolkit,
    );
    const body = await this.http.call<{
      redirect_url?: string;
      connected_account_id?: string;
    }>("/api/v3.1/connected_accounts/link", {
      method: "POST",
      body: {
        auth_config_id: authConfigId,
        user_id: userId,
        ...(this.callbackUrl ? { callback_url: this.callbackUrl } : {}),
      },
    });
    if (!body?.redirect_url || !body.connected_account_id) {
      throw new Error("composio: link session returned no redirect_url");
    }
    return {
      redirectUrl: body.redirect_url,
      connectionId: body.connected_account_id,
    };
  }

  async connection(
    userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    const body = await this.http.call<RawConnection>(
      `/api/v3/connected_accounts/${encodeURIComponent(connectionId)}`,
      { nullStatuses: [404] },
    );
    if (!body) return null;
    // Never surface another user's connection, even to a guessed id. Fail
    // CLOSED: a response without a usable user_id proves nothing about
    // ownership, so it is treated as not this user's account.
    if (typeof body.user_id !== "string" || body.user_id !== userId)
      return null;
    return mapConnection(body);
  }

  async disconnect(userId: string, toolkit: string): Promise<void> {
    // Remove every connected account for the toolkit (a toolkit can have more
    // than one, e.g. two Gmail logins). List, then DELETE all in parallel —
    // the deletes are independent; any failure still rejects (surfaces).
    const accounts = await this.http.call<{ items?: RawConnection[] }>(
      "/api/v3/connected_accounts",
      { query: { user_ids: userId, toolkit_slugs: toolkit, limit: "100" } },
    );
    await Promise.all(
      (accounts?.items ?? [])
        .flatMap((acct) => (acct.id ? [acct.id] : []))
        .map((id) =>
          this.http.call(
            `/api/v3/connected_accounts/${encodeURIComponent(id)}`,
            { method: "DELETE" },
          ),
        ),
    );
  }

  async search(
    userId: string,
    query: string,
    _acting?: ActingContext,
  ): Promise<ToolMatch[]> {
    // The direct adapter owns the platform key and derives identity from the
    // verified `userId`; there is no upstream to re-authenticate as, so the
    // acting context is intentionally ignored (self-host / dev only). The merge
    // policy (scoped + global + catalog resolution) lives in composio-search.ts;
    // this wires it to the Composio transport. Every returned entry carries its
    // IntegrationAppStatus (connected/connectable derived from the user's set).
    return searchComposio(
      {
        listConnections: () => this.listConnections(userId),
        // GET /api/v3/tools?query=… (the older `search` param is deprecated).
        queryTools: async (q) => {
          const body = await this.http.call<{ items?: RawTool[] }>(
            "/api/v3/tools",
            { query: q },
          );
          return (body?.items ?? []).map(mapTool);
        },
        catalog: () => this.cachedCatalog(),
      },
      query,
    );
  }

  async execute(
    userId: string,
    action: string,
    params: Record<string, unknown>,
    _acting?: ActingContext,
  ): Promise<ActionResult> {
    // Acting context ignored — see search(): identity is the verified userId.
    const body = await this.http.call<RawExecute>(
      `/api/v3/tools/execute/${encodeURIComponent(action)}`,
      { method: "POST", body: { user_id: userId, arguments: params } },
    );
    return mapExecute(body);
  }
}
