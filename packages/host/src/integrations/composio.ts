import { resolveAuthConfig } from "./composio-auth-config";
import { fetchAllRawToolkits } from "./composio-catalog";
import { ComposioHttp } from "./composio-http";
import { extractIdentity, IDENTITY_PROBES } from "./composio-identity";
import { searchComposio } from "./composio-search";
import {
  mapConnection,
  mapExecute,
  mapTool,
  mapToolkit,
  type RawConnection,
  type RawExecute,
  type RawTool,
} from "./composio-wire";
import type {
  ActingContext,
  IntegrationProvider,
  ProviderSearchResult,
} from "./provider";
import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
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

/**
 * Which Composio TOOL VERSION every /tools read and execute requests. The v3
 * endpoints default to the FROZEN base snapshot (`00000000_00`), not the newest
 * release, so an unversioned call runs connector code from before versioning
 * launched — which ages until the third-party API retires what it depends on.
 * Prod bug: LINKEDIN_CREATE_LINKED_IN_POST at the base snapshot still sent
 * LinkedIn the retired `Linkedin-Version: 20241101` header → HTTP 426
 * NONEXISTENT_VERSION on every post, unfixable by reconnecting. `latest` is
 * Composio's own recommendation for agent consumers (the model re-reads each
 * action's schema from search every turn, so schema drift self-corrects), and
 * pinning search AND execute together keeps the schema the model read and the
 * connector that runs the SAME version.
 */
const TOOL_VERSION = "latest";

/**
 * Initiation fields Houston answers FOR the user at connect time. The hosted
 * connect page asks the user for every required initiation field — and renders
 * it as an editable text box even when a value was supplied; for highlevel
 * that was a free-text "Token Type" box whose value the token exchange relays
 * verbatim as `user_type` — HighLevel 422s anything but Location/Company, and
 * a user pasted their private-integration token into it (PRODUCT-1260).
 * Houston's non-technical audience should never see that question, so
 * toolkits listed here connect via the direct initiate path (the provider's
 * own OAuth page, no Composio form); Location is the token type most
 * HighLevel actions require.
 */
const PREFILLED_CONNECTION_DATA: Record<string, Record<string, string>> = {
  highlevel: { user_type: "Location" },
};

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
  /** connectionId → probed account identity (an account's identity never
   *  changes, so successes cache for the process lifetime; failures are NOT
   *  cached, so a transient probe error retries on the next list). */
  private readonly accountIdentity = new Map<string, string>();

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
    // no_auth toolkits (web search, weather…) stay in the catalog but carry
    // the flag: there is no account to connect (creating an auth config 400s
    // upstream — Auth_Config_NoAuthApp, seen in prod), yet their tools work
    // as-is. The UI renders them "ready to use" instead of connectable, and
    // search stamps their matches `connected` (see composio-search.ts).
    return (await fetchAllRawToolkits(this.http)).map(mapToolkit);
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
    return this.withAccountIdentity(
      userId,
      (body?.items ?? []).map(mapConnection),
    );
  }

  /**
   * Fill in the account identity for connections whose auth payload gave us no
   * label (Composio masks the tokens that would carry it — see
   * composio-identity.ts): one read-only profile call per account, targeted at
   * THAT account, cached for the process lifetime. A probe failure just leaves
   * the label off (the UI falls back to the connection date) — labelling is
   * enrichment and must never break the list itself.
   */
  private async withAccountIdentity(
    userId: string,
    connections: Connection[],
  ): Promise<Connection[]> {
    return Promise.all(
      connections.map(async (connection) => {
        if (connection.accountLabel || connection.status !== "active") {
          return connection;
        }
        const probe = IDENTITY_PROBES[connection.toolkit.toLowerCase()];
        if (!probe || !connection.connectionId) return connection;
        const cached = this.accountIdentity.get(connection.connectionId);
        if (cached) return { ...connection, accountLabel: cached };
        try {
          const result = await this.execute(
            userId,
            probe.action,
            probe.params ?? {},
            undefined,
            connection.connectionId,
          );
          const label = result.successful
            ? extractIdentity(result.data, probe.fields)
            : undefined;
          if (!label) return connection;
          this.accountIdentity.set(connection.connectionId, label);
          return { ...connection, accountLabel: label };
        } catch {
          // Probe failure = no label this round (date fallback in the UI);
          // deliberately uncached so the next list retries.
          return connection;
        }
      }),
    );
  }

  /**
   * Start connecting a toolkit: mint an auth-link session — Composio hosts the
   * OAuth dance and the user authorizes the APP (Gmail…), never Composio. The
   * returned connectionId is polled via connection() until it turns active.
   *
   * Toolkits with prefilled connection data try the legacy v3 initiate FIRST:
   * with every required initiation field already answered it returns a
   * redirect straight to the provider's own OAuth page, skipping Composio's
   * hosted form entirely (the form renders even a supplied field as an
   * editable text box, which is how PRODUCT-1260's user pasted a pit-… token
   * over the prefill). Initiate is retired for Composio-managed auth (400s
   * for orgs created after 2026-05-08), so any rejection falls back to the
   * hosted link — which still carries the prefill as the field's value.
   */
  async connect(userId: string, toolkit: string): Promise<ConnectStart> {
    const authConfigId = await resolveAuthConfig(
      this.http,
      this.authConfigs,
      toolkit,
    );
    const prefill = PREFILLED_CONNECTION_DATA[toolkit.toLowerCase()];
    if (prefill) {
      try {
        return await this.initiateConnection(authConfigId, userId, prefill);
      } catch (err) {
        console.warn(
          `[integrations] composio: prefilled initiate rejected for '${toolkit}', falling back to hosted link: ${String(err)}`,
        );
      }
    }
    const body = await this.http.call<{
      redirect_url?: string;
      connected_account_id?: string;
    }>("/api/v3.1/connected_accounts/link", {
      method: "POST",
      body: {
        auth_config_id: authConfigId,
        user_id: userId,
        ...(this.callbackUrl ? { callback_url: this.callbackUrl } : {}),
        ...(prefill ? { connection_data: prefill } : {}),
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

  /** Direct (non-hosted) connect: POST the initiation data ourselves and get
   *  the provider's OAuth redirect back. Only called with a complete prefill;
   *  the response's redirect_url points at the provider (verified live:
   *  highlevel → marketplace.gohighlevel.com's chooselocation). */
  private async initiateConnection(
    authConfigId: string,
    userId: string,
    data: Record<string, string>,
  ): Promise<ConnectStart> {
    const body = await this.http.call<{ id?: string; redirect_url?: string }>(
      "/api/v3/connected_accounts",
      {
        method: "POST",
        body: {
          auth_config: { id: authConfigId },
          connection: {
            user_id: userId,
            data,
            ...(this.callbackUrl ? { callback_url: this.callbackUrl } : {}),
          },
        },
      },
    );
    if (!body?.redirect_url || !body.id) {
      throw new Error("composio: initiate returned no redirect_url");
    }
    return { redirectUrl: body.redirect_url, connectionId: body.id };
  }

  async connection(
    userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    const owned = await this.ownedConnection(userId, connectionId);
    if (!owned) return null;
    const [labelled] = await this.withAccountIdentity(userId, [owned]);
    return labelled ?? null;
  }

  /** One connection by id with the fail-closed ownership check, UNLABELLED —
   *  the shared primitive for the poll (which labels on top) and the targeted
   *  disconnect (which must never probe an account it is about to delete). */
  private async ownedConnection(
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

  async disconnect(
    userId: string,
    toolkit: string,
    connectionId?: string,
  ): Promise<void> {
    // One account named → remove exactly that one, after proving it belongs to
    // this user AND this toolkit (the same fail-closed ownership guard the
    // poll uses; a guessed or cross-user id deletes nothing). Already gone
    // upstream → the user's intent holds, same as the 404-tolerant bulk path
    // below.
    if (connectionId) {
      const owned = await this.ownedConnection(userId, connectionId);
      if (!owned || owned.toolkit.toLowerCase() !== toolkit.toLowerCase()) {
        return;
      }
      await this.http.call(
        `/api/v3/connected_accounts/${encodeURIComponent(connectionId)}`,
        { method: "DELETE", nullStatuses: [404] },
      );
      return;
    }
    // Remove every connected account for the toolkit (a toolkit can have more
    // than one, e.g. two Gmail logins). List, then DELETE all in parallel —
    // the deletes are independent; any failure still rejects (surfaces). A 404
    // on the DELETE is success, not failure: the account is already gone
    // upstream (Composio expired/removed it, or a retry raced a prior
    // disconnect), and the user's intent — "this account is disconnected" —
    // holds. Erroring here wedges the one flow that would clear the stale
    // entry (HOU-892).
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
            { method: "DELETE", nullStatuses: [404] },
          ),
        ),
    );
  }

  async search(
    userId: string,
    query: string,
    _acting?: ActingContext,
    app?: string,
  ): Promise<ProviderSearchResult> {
    // The direct adapter owns the platform key and derives identity from the
    // verified `userId`; there is no upstream to re-authenticate as, so the
    // acting context is intentionally ignored (self-host / dev only). The merge
    // policy (named-app + scoped + global + catalog resolution) lives in
    // composio-search.ts; this wires it to the Composio transport. Every entry
    // carries its IntegrationAppStatus (derived from the user's connections).
    return searchComposio(
      {
        listConnections: () => this.listConnections(userId),
        // GET /api/v3/tools?query=… (the older `search` param is deprecated).
        // toolkit_versions pins the CURRENT tool set — unversioned, this
        // endpoint serves only the base snapshot's tools (4 of LinkedIn's 22).
        queryTools: async (q) => {
          const body = await this.http.call<{ items?: RawTool[] }>(
            "/api/v3/tools",
            { query: { ...q, toolkit_versions: TOOL_VERSION } },
          );
          return (body?.items ?? []).map(mapTool);
        },
        catalog: () => this.cachedCatalog(),
      },
      query,
      app,
    );
  }

  async execute(
    userId: string,
    action: string,
    params: Record<string, unknown>,
    _acting?: ActingContext,
    account?: string,
  ): Promise<ActionResult> {
    // Acting context ignored — see search(): identity is the verified userId.
    // `version` pins the connector build that runs — see TOOL_VERSION.
    // `connected_account_id` targets ONE of the user's accounts when the
    // toolkit holds several (two Gmail logins); Composio requires user_id
    // alongside it and rejects an account that is not this user's, so the
    // verified userId stays the identity either way.
    const body = await this.http.call<RawExecute>(
      `/api/v3/tools/execute/${encodeURIComponent(action)}`,
      {
        method: "POST",
        body: {
          user_id: userId,
          arguments: params,
          version: TOOL_VERSION,
          ...(account ? { connected_account_id: account } : {}),
        },
      },
    );
    return mapExecute(body);
  }
}
