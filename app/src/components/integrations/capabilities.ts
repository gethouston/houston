import type {
  Capabilities,
  IntegrationConnection,
} from "@houston-ai/engine-client";

/**
 * Deployment-capability predicates for the integrations surfaces: whether the
 * host wires integrations at all, whether it also serves the custom API-key
 * provider, and the routing set that tells custom connections apart. All pure so
 * both surfaces and the node-runner tests share one source of truth without
 * pulling in React or the query layer.
 */

/**
 * Whether this deployment serves the integration routes at all. The host
 * advertises the providers actually wired in `/v1/capabilities` — a deployment
 * with neither a gateway URL nor a platform key honestly serves `[]` and answers
 * every `/v1/integrations` route with 503 ("integrations not configured"), so
 * callers must not fetch there. `null` capabilities (still loading, or the legacy
 * Rust engine, which has no integration routes) also means don't fetch.
 */
export function integrationsSupported(
  capabilities: Pick<Capabilities, "integrations"> | null,
): boolean {
  return (capabilities?.integrations.length ?? 0) > 0;
}

/**
 * Whether this deployment ALSO serves the custom API-key integration provider (a
 * second provider that runs in the cloud gateway, advertised as `"custom"` in
 * `/v1/capabilities`). Separate from `integrationsSupported` because a host can
 * serve composio without custom (e.g. self-host direct), and the custom "add"
 * CTA + custom cards must stay hidden there. The literal mirrors
 * `CUSTOM_INTEGRATION_PROVIDER` (kept in the query-keys module to avoid a
 * pure-module → hooks import).
 */
export function customIntegrationsSupported(
  capabilities: Pick<Capabilities, "integrations"> | null,
): boolean {
  return capabilities?.integrations.includes("custom") ?? false;
}

/**
 * The set of slugs behind a list of custom connections. For a custom integration
 * the slug IS both the `toolkit` and the `connectionId`, so a single set answers
 * "is this row / this connection custom?" by either key (routes the detail sheet,
 * the disconnect provider, and the "add another account" suppression).
 */
export function customSlugSet(
  connections: IntegrationConnection[],
): Set<string> {
  return new Set(connections.map((c) => c.connectionId));
}

/**
 * Whether this deployment ALSO serves the remote MCP server provider (a third
 * provider that runs in the cloud gateway, advertised as `"mcp"` in
 * `/v1/capabilities`). Separate from `customIntegrationsSupported` because a host
 * can serve one without the other, and the MCP "add" CTA + MCP cards must stay
 * hidden where the gateway does not run it. The literal mirrors
 * `MCP_INTEGRATION_PROVIDER` (kept in the query-keys module to avoid a
 * pure-module → hooks import).
 */
export function mcpIntegrationsSupported(
  capabilities: Pick<Capabilities, "integrations"> | null,
): boolean {
  return capabilities?.integrations.includes("mcp") ?? false;
}

/**
 * The set of slugs behind a list of MCP server connections. For an MCP server
 * the slug IS both the `toolkit` and the `connectionId`, so a single set answers
 * "is this row / this connection an MCP server?" by either key (routes the detail
 * sheet, the disconnect provider, and the "add another account" suppression).
 */
export function mcpSlugSet(connections: IntegrationConnection[]): Set<string> {
  return new Set(connections.map((c) => c.connectionId));
}
