import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { MCP_INTEGRATION_PROVIDER } from "../../hooks/queries/mcp-server-keys";
import { useCapabilities } from "../../hooks/use-capabilities";
import { mcpIntegrationsSupported, mcpSlugSet } from "./capabilities";

export interface McpIntegrationsData {
  /** The caller's MCP servers as connections (one active per slug). */
  connections: IntegrationConnection[];
  /** The same servers as toolkits, so `appDisplay` resolves name + logo. */
  toolkits: IntegrationToolkit[];
  /**
   * Slugs of the caller's MCP servers. For MCP the slug IS both the `toolkit`
   * and the `connectionId`, so a single set answers "is this row / this
   * connection an MCP server?" by either key — used to route the detail sheet,
   * the disconnect provider, and the "add another account" suppression.
   */
  slugs: Set<string>;
  /** This deployment serves the mcp provider (drives the "add" CTA). */
  supported: boolean;
  isLoading: boolean;
}

/**
 * The caller's remote MCP server integrations, fetched only when the host
 * advertises the `"mcp"` provider (else every field is empty and `supported` is
 * false, so both surfaces render exactly as before). Mirrors
 * `useCustomIntegrations` so the merge + routing logic lives in one place.
 * `enabled` lets a surface hold the fetch behind its own boot gate.
 */
export function useMcpIntegrations(enabled: boolean): McpIntegrationsData {
  const { capabilities } = useCapabilities();
  const supported = mcpIntegrationsSupported(capabilities);
  const on = enabled && supported;
  const connections = useIntegrationConnections(MCP_INTEGRATION_PROVIDER, on);
  const toolkits = useIntegrationToolkits(MCP_INTEGRATION_PROVIDER, on);

  const conns = connections.data ?? [];
  const slugs = useMemo(() => mcpSlugSet(conns), [conns]);

  return {
    connections: conns,
    toolkits: toolkits.data ?? [],
    slugs,
    supported,
    isLoading: on && (connections.isLoading || toolkits.isLoading),
  };
}
