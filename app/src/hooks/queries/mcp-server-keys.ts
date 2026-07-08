import { queryKeys } from "../../lib/query-keys.ts";

/**
 * Provider id for remote MCP server integrations. Distinct from the composio
 * `INTEGRATION_PROVIDER` and the `custom` provider; MCP servers are a third
 * provider that runs in the cloud gateway (Streamable HTTP transport).
 */
export const MCP_INTEGRATION_PROVIDER = "mcp";

/**
 * Query keys to invalidate after an MCP-server create/update. Both must
 * refetch: the provider's connection list (a create/edit is a new/changed
 * connection) AND its toolkit catalog (for the mcp provider the toolkits ARE
 * the caller's own servers, so the catalog itself changes). Pure so it is
 * unit-testable without rendering the mutation hook.
 */
export function mcpServerInvalidationKeys(): readonly (readonly string[])[] {
  return [
    queryKeys.integrationConnections(MCP_INTEGRATION_PROVIDER),
    queryKeys.integrationToolkits(MCP_INTEGRATION_PROVIDER),
  ];
}
