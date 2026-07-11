import type { ActionResult, Connection, Toolkit, ToolMatch } from "../types";
import type { McpClientSession } from "./client";
import { HUB_APP_CATALOG } from "./hub-catalog";
import {
  appConnectionId,
  executeOutcome,
  HUB_EXECUTE,
  HUB_MANAGE,
  HUB_SEARCH,
  hubPayload,
  isHubToolset,
  manageResults,
  searchSlugs,
  toAppConnections,
  toolkitOfSlug,
} from "./hub-wire";

const CONNECTIONS_TTL_MS = 30_000;

/**
 * The Composio-hub personality of an MCP integration: when a server exposes
 * the COMPOSIO_* meta-tools, the port's toolkit/connection/search/execute
 * calls map onto them — so the SAME Integrations catalog UI, connect flow,
 * per-agent grants, and in-chat connect card that serve the platform provider
 * serve the hub, per app. Detection is once per session (tools/list is cached
 * by the client); a non-hub MCP server never reaches this class.
 */
export class ComposioHubAdapter {
  private connCache?: { at: number; states: ReturnType<typeof manageResults> };

  constructor(private readonly client: McpClientSession) {}

  async detect(): Promise<boolean> {
    const tools = await this.client.listTools();
    return isHubToolset(tools.map((t) => t.name));
  }

  catalog(): Toolkit[] {
    return HUB_APP_CATALOG;
  }

  private async manage(
    entries: {
      name: string;
      action: "add" | "list" | "remove";
      account_id?: string;
    }[],
  ) {
    const result = await this.client.callTool(HUB_MANAGE, {
      toolkits: entries,
    });
    return manageResults(hubPayload(result));
  }

  /** ACTIVE app connections, from ONE batched list over the catalog (cached). */
  async connections(): Promise<Connection[]> {
    const now = Date.now();
    if (!this.connCache || now - this.connCache.at >= CONNECTIONS_TTL_MS) {
      this.connCache = {
        at: now,
        states: await this.manage(
          HUB_APP_CATALOG.map((t) => ({
            name: t.slug,
            action: "list" as const,
          })),
        ),
      };
    }
    return toAppConnections(this.connCache.states);
  }

  /** Start an app's OAuth: the hub mints the browser link. */
  async connectApp(
    toolkit: string,
  ): Promise<{ redirectUrl: string; connectionId: string }> {
    this.connCache = undefined;
    const states = await this.manage([{ name: toolkit, action: "add" }]);
    const url = states.find((s) => s.toolkit === toolkit)?.redirectUrl;
    if (!url) {
      throw new Error(
        `the app hub returned no authorization link for '${toolkit}'`,
      );
    }
    return { redirectUrl: url, connectionId: appConnectionId(toolkit) };
  }

  /** Poll target while the browser flow runs ("app:<toolkit>"). */
  async appConnection(connectionId: string): Promise<Connection | null> {
    const toolkit = connectionId.startsWith("app:")
      ? connectionId.slice(4)
      : null;
    if (!toolkit) return null;
    const states = await this.manage([{ name: toolkit, action: "list" }]);
    const state = states.find((s) => s.toolkit === toolkit);
    if (!state) return null;
    if (state.status === "active") this.connCache = undefined;
    return {
      toolkit,
      connectionId,
      status: state.status === "active" ? "active" : "pending",
    };
  }

  async disconnectApp(toolkit: string): Promise<void> {
    const states = await this.manage([{ name: toolkit, action: "list" }]);
    const ids = states.find((s) => s.toolkit === toolkit)?.accountIds ?? [];
    if (ids.length > 0) {
      await this.manage(
        ids.map((id) => ({
          name: toolkit,
          action: "remove" as const,
          account_id: id,
        })),
      );
    }
    this.connCache = undefined;
  }

  /**
   * Search = the hub's own use-case search, mapped to per-app ToolMatches with
   * REAL toolkit slugs and connected status — an unconnected app comes back
   * `connectable`, which is exactly what makes the agent offer the in-chat
   * connect card instead of pasting the hub's raw auth link.
   */
  async search(query: string): Promise<ToolMatch[]> {
    const [result, connections] = await Promise.all([
      this.client.callTool(HUB_SEARCH, { queries: [{ use_case: query }] }),
      this.connections(),
    ]);
    const connected = new Set(connections.map((c) => c.toolkit));
    const known = [...HUB_APP_CATALOG.map((t) => t.slug), ...connected];
    const matches = searchSlugs(hubPayload(result)).map((slug) => {
      const toolkit = toolkitOfSlug(slug, known);
      return {
        action: slug,
        toolkit,
        description: slug.replaceAll("_", " ").toLowerCase(),
        connected: connected.has(toolkit),
        status: connected.has(toolkit)
          ? ("connected" as const)
          : ("connectable" as const),
      };
    });
    // Toolkit-level rows teach the model each unconnected app's slug even when
    // it fixates on the actions, mirroring the platform adapter's shape.
    const unconnected = [
      ...new Set(matches.filter((m) => !m.connected).map((m) => m.toolkit)),
    ];
    return [
      ...matches,
      ...unconnected.map((toolkit) => ({
        action: "",
        toolkit,
        description:
          HUB_APP_CATALOG.find((t) => t.slug === toolkit)?.description ??
          toolkit,
        connected: false,
        status: "connectable" as const,
      })),
    ];
  }

  async execute(
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    const result = await this.client.callTool(HUB_EXECUTE, {
      tools: [{ tool_slug: action, arguments: params }],
    });
    return executeOutcome(hubPayload(result), action);
  }
}
