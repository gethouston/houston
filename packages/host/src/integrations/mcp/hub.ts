import type { ActionResult, Connection, Toolkit, ToolMatch } from "../types";
import type { McpClientSession } from "./client";
import { HUB_PROBE_SLUGS } from "./hub-catalog";
import type { HubCatalogSource } from "./hub-catalog-source";
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
export interface HubAppRecord {
  /** App toolkits this install has connected (persisted; probe coverage). */
  read(): Promise<string[]>;
  record(toolkit: string): Promise<void>;
}

export class ComposioHubAdapter {
  private connCache?: { at: number; states: ReturnType<typeof manageResults> };

  constructor(
    private readonly client: McpClientSession,
    private readonly catalogSource: HubCatalogSource,
    private readonly apps: HubAppRecord,
  ) {}

  async detect(): Promise<boolean> {
    const tools = await this.client.listTools();
    return isHubToolset(tools.map((t) => t.name));
  }

  /**
   * The browsable catalog: the freshest fetched/baked snapshot, SELF-HEALED
   * with any actually-connected app the snapshot lacks (synthesized from the
   * slug + the public logo service) — a brand-new Composio app someone
   * connects from chat shows its card before any snapshot refresh ships it.
   */
  async catalog(): Promise<Toolkit[]> {
    const [snapshot, connections] = await Promise.all([
      this.catalogSource.resolve(),
      this.connections().catch(() => []),
    ]);
    const known = new Set(snapshot.map((t) => t.slug));
    const synthesized = connections
      .filter((c) => !known.has(c.toolkit))
      .map((c) => ({
        slug: c.toolkit,
        name: c.toolkit,
        description: "Connected app",
        logoUrl: `https://logos.composio.dev/api/${c.toolkit}`,
      }));
    return [...snapshot, ...synthesized];
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

  /**
   * ACTIVE app connections, from ONE batched list (cached). The probe set is
   * bounded: popular apps plus every toolkit this install ever connected —
   * never the full ~1000-app catalog, which would make a huge hub request.
   */
  async connections(): Promise<Connection[]> {
    const now = Date.now();
    if (!this.connCache || now - this.connCache.at >= CONNECTIONS_TTL_MS) {
      const probe = [
        ...new Set([...HUB_PROBE_SLUGS, ...(await this.apps.read())]),
      ];
      this.connCache = {
        at: now,
        states: await this.manage(
          probe.map((name) => ({ name, action: "list" as const })),
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
    if (state.status === "active") {
      this.connCache = undefined;
      // Remember the toolkit so the bounded connection probe covers it from
      // now on, even when it is not in the popular set.
      await this.apps.record(toolkit);
    }
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
    const catalog = await this.catalogSource.resolve();
    const known = [...catalog.map((t) => t.slug), ...connected];
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
          catalog.find((t) => t.slug === toolkit)?.description ?? toolkit,
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
