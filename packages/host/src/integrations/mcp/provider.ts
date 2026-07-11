import { randomBytes } from "node:crypto";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
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
} from "./authorization";
import { McpAuthRequiredError, McpClientSession } from "./client";
import { StoredMcpOAuthProvider } from "./oauth";
import { mapMcpResult, rankTools } from "./tool-mapping";

export interface McpIntegrationProviderOptions extends McpServerConfig {
  store: McpAuthStore;
  exchangeAuthorization?: McpAuthorizationExchanger;
}

export type { McpServerConfig } from "./authorization";

export class McpIntegrationProvider implements IntegrationProvider {
  readonly id: string;
  private readonly description: string;
  private readonly connectionId: string;
  private readonly oauth: StoredMcpOAuthProvider;
  private readonly client: McpClientSession;
  private readonly exchangeAuthorization: McpAuthorizationExchanger;
  private readonly pendingClaimer: PendingAuthorizationClaimer;
  private authorizationUrl?: string;

  constructor(private readonly options: McpIntegrationProviderOptions) {
    this.id = options.id;
    this.connectionId = `mcp:${this.id}`;
    this.description = `Remote MCP server (${new URL(options.url).hostname})`;
    this.oauth = new StoredMcpOAuthProvider(
      this.id,
      options.store,
      options.redirectUrl,
      (url) => {
        this.authorizationUrl = url.toString();
      },
    );
    this.client = new McpClientSession(options.url, this.oauth);
    this.exchangeAuthorization =
      options.exchangeAuthorization ?? defaultMcpAuthorizationExchange;
    this.pendingClaimer = new PendingAuthorizationClaimer(
      options.store,
      this.id,
    );
  }

  async readiness(): Promise<ProviderReadiness> {
    return { ready: true };
  }

  async listToolkits(): Promise<Toolkit[]> {
    return [
      {
        slug: this.id,
        name: this.options.name ?? this.id,
        description: this.description,
      },
    ];
  }

  async listConnections(_userId: string): Promise<Connection[]> {
    const state = await this.options.store.read(this.id);
    if (state.tokens) return [this.makeConnection("active")];
    if (state.pending) return [this.makeConnection("pending")];
    return [];
  }

  async connect(_userId: string, toolkit: string): Promise<ConnectStart> {
    if (toolkit !== this.id)
      throw new Error(`unknown MCP toolkit '${toolkit}'`);
    const state = await this.options.store.read(this.id);
    state.pending = {
      state: randomBytes(32).toString("base64url"),
      startedAtMs: Date.now(),
    };
    await this.options.store.write(this.id, state);
    this.authorizationUrl = undefined;
    try {
      await auth(this.oauth, { serverUrl: this.options.url });
      if (!this.authorizationUrl)
        throw new Error("MCP OAuth returned no authorization URL");
      return {
        redirectUrl: this.authorizationUrl,
        connectionId: this.connectionId,
      };
    } catch (error) {
      const failed = await this.options.store.read(this.id);
      delete failed.pending;
      await this.options.store.write(this.id, failed);
      throw error;
    }
  }

  async connection(
    _userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    if (connectionId !== this.connectionId) return null;
    return (await this.listConnections(_userId))[0] ?? null;
  }

  async disconnect(_userId: string, toolkit: string): Promise<void> {
    if (toolkit !== this.id)
      throw new Error(`unknown MCP toolkit '${toolkit}'`);
    const state = await this.options.store.read(this.id);
    delete state.tokens;
    delete state.pending;
    delete state.codeVerifier;
    await this.options.store.write(this.id, state);
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
    if (!(await this.options.store.read(this.id)).tokens)
      return [this.connectable()];
    try {
      return rankTools(await this.client.listTools(), query).map(
        ({ tool }) => ({
          action: tool.name,
          toolkit: this.id,
          description: tool.description ?? "",
          inputParams: tool.inputSchema,
          connected: true,
          status: "connected",
        }),
      );
    } catch (error) {
      if (error instanceof McpAuthRequiredError) return [this.connectable()];
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

  private makeConnection(status: Connection["status"]): Connection {
    return { toolkit: this.id, connectionId: this.connectionId, status };
  }

  private connectable(): ToolMatch {
    return {
      action: "",
      toolkit: this.id,
      description: this.description,
      connected: false,
      status: "connectable",
    };
  }
}
