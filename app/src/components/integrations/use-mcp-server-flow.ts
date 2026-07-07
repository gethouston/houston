import type { IntegrationConnection } from "@houston-ai/engine-client";
import { useCallback } from "react";
import {
  useAgentGrantMutation,
  useCreateMcpServer,
  useUpdateMcpServer,
} from "../../hooks/queries";
import type { McpCreateResult, McpPatch } from "./mcp-server-model";

export interface McpServerFlow {
  /**
   * Connect the MCP server, then (agent context) auto-grant the new connection
   * to the current agent so it lands as usable there. Returns the connection;
   * throws on failure so the dialog can stay open (the underlying `call()`
   * wrapper already toasted + reported the reason).
   */
  create: (
    ok: Extract<McpCreateResult, { ok: true }>,
  ) => Promise<IntegrationConnection>;
  /** Edit the server; the caller built the patch from touched fields. */
  update: (
    connectionId: string,
    patch: McpPatch,
  ) => Promise<IntegrationConnection>;
  submitting: boolean;
}

/**
 * The create / edit hand-off for MCP servers, mirroring `useCustomIntegrationFlow`:
 * the create mutation, plus the same per-agent auto-grant so a brand-new server
 * is immediately usable by the agent that added it. The grant is keyed by the
 * returned `connectionId` (the server-generated slug) and no-ops off agent
 * context. Its failure surfaces via `call()` but never masks the successful
 * create — the connection still lands.
 */
export function useMcpServerFlow(opts: {
  agentId?: string;
  autoGrant: boolean;
}): McpServerFlow {
  const { agentId, autoGrant } = opts;
  const createMutation = useCreateMcpServer();
  const updateMutation = useUpdateMcpServer();
  const { mutateAsync: mutateGrant } = useAgentGrantMutation(agentId ?? "");

  const create = useCallback(
    async (ok: Extract<McpCreateResult, { ok: true }>) => {
      const connection = await createMutation.mutateAsync({
        ...ok.config,
        authValue: ok.authValue,
      });
      if (autoGrant && agentId) {
        try {
          await mutateGrant({
            connectionId: connection.connectionId,
            op: "add",
          });
        } catch {
          // Surfaced by call(); the server itself was connected.
        }
      }
      return connection;
    },
    [createMutation, autoGrant, agentId, mutateGrant],
  );

  const update = useCallback(
    (connectionId: string, patch: McpPatch) =>
      updateMutation.mutateAsync({ connectionId, patch }),
    [updateMutation],
  );

  return {
    create,
    update,
    submitting: createMutation.isPending || updateMutation.isPending,
  };
}
