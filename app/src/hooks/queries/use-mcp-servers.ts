import type { McpServerConfig } from "@houston-ai/engine-client";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { tauriIntegrations } from "../../lib/tauri";
import {
  MCP_INTEGRATION_PROVIDER,
  mcpServerInvalidationKeys,
} from "./mcp-server-keys";

/** Refetch the mcp provider's connections + toolkits after a create/edit. */
function invalidateMcpServer(qc: QueryClient): Promise<void> {
  return Promise.all(
    mcpServerInvalidationKeys().map((queryKey) =>
      qc.invalidateQueries({ queryKey }),
    ),
  ).then(() => undefined);
}

/**
 * Connect a remote MCP server (provider `"mcp"`). On success it refetches the
 * mcp provider's connection list AND toolkit catalog (for this provider the
 * toolkits ARE the caller's servers). Carries no `onError` for the same reason
 * as the custom-integration mutations: the `call()` wrapper already surfaces +
 * reports the failure once, so an `onError` here would double-toast. The
 * auto-grant of the new connection to the current agent is the caller's job (it
 * needs the agent context), done off this mutation's resolved connection.
 */
export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: McpServerConfig & { authValue?: string }) =>
      tauriIntegrations.createMcp(MCP_INTEGRATION_PROVIDER, config),
    onSuccess: () => invalidateMcpServer(qc),
  });
}

/**
 * Edit a remote MCP server. An omitted `authValue` in `patch` keeps the stored
 * secret. Invalidates the same mcp-provider queries as create. No `onError`
 * toast — the `call()` wrapper surfaces it once.
 */
export function useUpdateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      patch,
    }: {
      connectionId: string;
      patch: Partial<McpServerConfig> & { authValue?: string };
    }) =>
      tauriIntegrations.updateMcp(
        MCP_INTEGRATION_PROVIDER,
        connectionId,
        patch,
      ),
    onSuccess: () => invalidateMcpServer(qc),
  });
}
