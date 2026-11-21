import { resolveAuthConfig } from "./composio-auth-config";
import { fetchAllRawToolkits } from "./composio-catalog";
import {
  describeComposioAction,
  reserveComposioUpload,
} from "./composio-files";
import { ComposioHttp } from "./composio-http";
import { ComposioIdentityCache } from "./composio-identity-cache";
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
  ActionDescription,
  FileUploadRequest,
  FileUploadSlot,
} from "./file-args";
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

const DEFAULT_BASE_URL = "https://backend.composio.dev";

const CATALOG_TTL_MS = 60 * 60 * 1000;

const TOOL_VERSION = "latest";

const PREFILLED_CONNECTION_DATA: Record<string, Record<string, string>> = {
  highlevel: { user_type: "Location" },
};

export interface ComposioOptions {
  apiKey: string;
  baseURL?: string;
  callbackUrl?: string;
  fetch?: typeof fetch;
}

export class ComposioProvider implements IntegrationProvider {
  readonly id = "composio";
  private readonly http: ComposioHttp;
  private readonly callbackUrl?: string;
  private readonly authConfigs = new Map<string, string>();
  private catalogCache?: { at: number; toolkits: Toolkit[] };
  private catalogInflight?: Promise<Toolkit[]>;
  private readonly accountIdentity = new ComposioIdentityCache((...args) =>
    this.execute(...args),
  );

  constructor(opts: ComposioOptions) {
    if (!opts.apiKey) throw new Error("composio: missing platform api key");
    this.http = new ComposioHttp(
      opts.apiKey,
      (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
      opts.fetch ?? fetch,
    );
    this.callbackUrl = opts.callbackUrl;
  }

  async readiness(): Promise<ProviderReadiness> {
    return { ready: true };
  }

  private async fetchToolkits(): Promise<Toolkit[]> {
    return (await fetchAllRawToolkits(this.http)).map(mapToolkit);
  }

  async listToolkits(): Promise<Toolkit[]> {
    return this.fetchToolkits();
  }

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
    return this.accountIdentity.enrich(
      userId,
      (body?.items ?? []).map(mapConnection),
    );
  }

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
    const [labelled] = await this.accountIdentity.enrich(userId, [owned]);
    return labelled ?? null;
  }

  private async ownedConnection(
    userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    const body = await this.http.call<RawConnection>(
      `/api/v3/connected_accounts/${encodeURIComponent(connectionId)}`,
      { nullStatuses: [404] },
    );
    if (!body) return null;
    if (typeof body.user_id !== "string" || body.user_id !== userId)
      return null;
    return mapConnection(body);
  }

  async disconnect(
    userId: string,
    toolkit: string,
    connectionId?: string,
  ): Promise<void> {
    if (connectionId) {
      const owned = await this.ownedConnection(userId, connectionId);
      if (!owned || owned.toolkit.toLowerCase() !== toolkit.toLowerCase()) {
        return;
      }
      await this.http.call(
        `/api/v3/connected_accounts/${encodeURIComponent(connectionId)}`,
        { method: "DELETE", nullStatuses: [404] },
      );
      this.accountIdentity.invalidate(connectionId);
      return;
    }
    const accounts = await this.http.call<{ items?: RawConnection[] }>(
      "/api/v3/connected_accounts",
      { query: { user_ids: userId, toolkit_slugs: toolkit, limit: "100" } },
    );
    await Promise.all(
      (accounts?.items ?? [])
        .flatMap((acct) => (acct.id ? [acct.id] : []))
        .map(async (id) => {
          await this.http.call(
            `/api/v3/connected_accounts/${encodeURIComponent(id)}`,
            { method: "DELETE", nullStatuses: [404] },
          );
          this.accountIdentity.invalidate(id);
        }),
    );
  }

  async search(
    userId: string,
    query: string,
    _acting?: ActingContext,
    app?: string,
  ): Promise<ProviderSearchResult> {
    return searchComposio(
      {
        listConnections: () => this.listConnections(userId),
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

  describeAction(
    _userId: string,
    action: string,
  ): Promise<ActionDescription | null> {
    return describeComposioAction(this.http, action, TOOL_VERSION);
  }

  reserveFileUpload(
    _userId: string,
    req: FileUploadRequest,
  ): Promise<FileUploadSlot> {
    return reserveComposioUpload(this.http, req);
  }
}
