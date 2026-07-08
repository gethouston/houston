import { useCallback } from "react";
import { useDisconnectIntegration } from "../../hooks/queries";
import { CUSTOM_INTEGRATION_PROVIDER } from "../../hooks/queries/custom-integration-keys";
import { MCP_INTEGRATION_PROVIDER } from "../../hooks/queries/mcp-server-keys";
import { INTEGRATION_PROVIDER } from "./model";

/**
 * Disconnect an account routed to its OWNING provider: a custom API-key
 * integration → the `"custom"` provider, a remote MCP server → the `"mcp"`
 * provider (both delete + prune server-side), every other app → composio. The
 * two slug sets are keyed by `connectionId` (== slug for custom + mcp), so the id
 * alone picks the route. Shared by the global page and the agent tab so the
 * three-way routing lives in exactly one place.
 */
export function useProviderDisconnect(
  customSlugs: ReadonlySet<string>,
  mcpSlugs: ReadonlySet<string>,
): (connectionId: string) => void {
  const composio = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const custom = useDisconnectIntegration(CUSTOM_INTEGRATION_PROVIDER);
  const mcp = useDisconnectIntegration(MCP_INTEGRATION_PROVIDER);
  return useCallback(
    (connectionId: string) => {
      const target = customSlugs.has(connectionId)
        ? custom
        : mcpSlugs.has(connectionId)
          ? mcp
          : composio;
      target.mutate(connectionId);
    },
    [customSlugs, mcpSlugs, composio, custom, mcp],
  );
}
