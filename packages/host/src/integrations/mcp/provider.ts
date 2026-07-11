import type { ActingContext, IntegrationProvider } from "../provider";
import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
  ToolMatch,
} from "../types";
import type { McpAuthStore } from "./auth-store";
import {
  defaultMcpAuthorizationExchange,
  type McpAuthorizationExchanger,
  type McpServerConfig,
  PendingAuthorizationClaimer,
  startOwnAuthorization,
} from "./authorization";
import { McpAuthRequiredError, McpClientSession } from "./client";
import { ComposioHubAdapter } from "./hub";
import { StoredMcpOAuthProvider } from "./oauth";
import { OwnConnection } from "./own-connection";
import { mapMcpResult, plainSearchMatches } from "./tool-mapping";

export interface McpIntegrationProviderOptions extends McpServerConfig {
  store: McpAuthStore;
  exchangeAuthorization?: McpAuthorizationExchanger;
}

export type { McpServerConfig } from "./authorization";

export class McpIntegrationProvider implements IntegrationProvider {
  readonly id: string;
  private readonly own: OwnConnection;
  private readonly oauth: StoredMcpOAuthProvider;
  private readonly client: McpClientSession;
  private readonly exchangeAuthorization: McpAuthorizationExchanger;
  private readonly pendingClaimer: PendingAuthorizationClaimer;
  private readonly hubAdapter: ComposioHubAdapter;
  private hubDetected?: boolean;
  private authorizationUrl?: string;

  constructor(private readonly options: McpIntegrationProviderOptions) {
    this.id = options.id;
    this.own = new OwnConnection(
      options.store,
      this.id,
      options.name ?? this.id,
      `Remote MCP server (${new URL(options.url).hostname})`,
    );
    this.oauth = new StoredMcpOAuthProvider(
      this.id,
      options.store,
      options.redirectUrl,
      (url) => {
        this.authorizationUrl = url.toString();
      },
    );
    this.client = new McpClientSession(options.url, this.oauth);
    this.hubAdapter = new ComposioHubAdapter(this.client, {
      read: async () => (await options.store.read(this.id)).appToolkits ?? [],
      record: async (toolkit) => {
        const state = await options.store.read(this.id);
        const next = new Set(state.appToolkits ?? []);
        if (next.has(toolkit)) return;
        next.add(toolkit);
        await options.store.write(this.id, {
          ...state,
          appToolkits: [...next].sort(),
        });
      },
    });
    this.exchangeAuthorization =
      options.exchangeAuthorization ?? defaultMcpAuthorizationExchange;
    this.pendingClaimer = new PendingAuthorizationClaimer(
      options.store,
      this.id,
    );
  }

  /** The hub personality, or null: plain servers and signed-out states. */
  private async hub(): Promise<ComposioHubAdapter | null> {
    if (!(await this.own.signedIn())) return null;
    if (this.hubDetected === undefined) {
      this.hubDetected = await this.hubAdapter.detect();
    }
    return this.hubDetected ? this.hubAdapter : null;
  }

  async readiness(): Promise<ProviderReadiness> {
    return { ready: true };
  }

  async listToolkits(): Promise<Toolkit[]> {
    const hub = await this.hub().catch(() => null);
    // The server itself is always the first "app": connecting it runs the MCP
    // OAuth, and on a hub that unlocks the per-app catalog behind it.
    return [this.own.toolkit(), ...(hub ? hub.catalog() : [])];
  }

  async listConnections(_userId: string): Promise<Connection[]> {
    const current = await this.own.current();
    if (current?.status !== "active") return current ? [current] : [];
    const hub = await this.hub().catch(() => null);
    const apps = hub ? await hub.connections().catch(() => []) : [];
    return [current, ...apps];
  }

  async connect(_userId: string, toolkit: string): Promise<ConnectStart> {
    if (toolkit !== this.id) {
      const hub = await this.hub();
      if (!hub) throw new Error(`unknown MCP toolkit '${toolkit}'`);
      return hub.connectApp(toolkit);
    }
    this.authorizationUrl = undefined;
    const redirectUrl = await startOwnAuthorization({
      store: this.options.store,
      id: this.id,
      oauth: this.oauth,
      serverUrl: this.options.url,
      takeAuthorizationUrl: () => this.authorizationUrl,
    });
    return { redirectUrl, connectionId: this.own.connectionId };
  }

  async connection(
    _userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    if (connectionId.startsWith("app:")) {
      const hub = await this.hub();
      return hub ? hub.appConnection(connectionId) : null;
    }
    if (connectionId !== this.own.connectionId) return null;
    return this.own.current();
  }

  async disconnect(_userId: string, toolkit: string): Promise<void> {
    if (toolkit !== this.id) {
      const hub = await this.hub();
      if (!hub) throw new Error(`unknown MCP toolkit '${toolkit}'`);
      await hub.disconnectApp(toolkit);
      return;
    }
    await this.own.clear();
    this.hubDetected = undefined;
    await this.client.close();
  }

  async claimAuthorization(
    state: string,
    nowMs = Date.now(),
  ): Promise<boolean> {
    return this.pendingClaimer.claim(state, nowMs);
  }

  async completeAuthorization(code: string): Promise<void> {
    await this.exchangeAuthorization(this.oauth, this.options.url, code);
    await this.client.close();
  }

  async search(
    _userId: string,
    query: string,
    _acting?: ActingContext,
  ): Promise<ToolMatch[]> {
    if (!(await this.own.signedIn())) return [this.own.connectable()];
    try {
      const hub = await this.hub();
      if (hub) return await hub.search(query);
      return plainSearchMatches(await this.client.listTools(), query, this.id);
    } catch (error) {
      if (error instanceof McpAuthRequiredError)
        return [this.own.connectable()];
      throw error;
    }
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
    _acting?: ActingContext,
  ): Promise<ActionResult> {
    try {
      const hub = await this.hub();
      if (hub) return await hub.execute(action, params);
      return mapMcpResult(await this.client.callTool(action, params));
    } catch (error) {
      if (error instanceof McpAuthRequiredError) {
        return {
          successful: false,
          error: `authorization expired, reconnect the ${this.id} app`,
        };
      }
      throw error;
    }
  }
}
