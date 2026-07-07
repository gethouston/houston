import type { IntegrationConnection } from "@houston-ai/engine-client";
import { useCallback } from "react";
import {
  useAgentGrantMutation,
  useCreateCustomIntegration,
  useUpdateCustomIntegration,
} from "../../hooks/queries";
import type { CreateResult, CustomPatch } from "./custom-integration-model";

export interface CustomIntegrationFlow {
  /**
   * Create the integration, then (agent context) auto-grant the new connection
   * to the current agent so it lands as usable there. Returns the connection;
   * throws on failure so the dialog can stay open (the underlying `call()`
   * wrapper already toasted + reported the reason).
   */
  create: (
    ok: Extract<CreateResult, { ok: true }>,
  ) => Promise<IntegrationConnection>;
  /** Edit the integration; the caller built the patch from touched fields. */
  update: (
    connectionId: string,
    patch: CustomPatch,
  ) => Promise<IntegrationConnection>;
  submitting: boolean;
}

/**
 * The create / edit hand-off for custom integrations, mirroring `useConnectFlow`
 * for OAuth apps: the create mutation, plus the same per-agent auto-grant so a
 * brand-new integration is immediately usable by the agent that added it. The
 * grant is keyed by the returned `connectionId` (the server-generated slug) and
 * no-ops off agent context. Its failure surfaces via `call()` but never masks
 * the successful create — the connection still lands.
 */
export function useCustomIntegrationFlow(opts: {
  agentId?: string;
  autoGrant: boolean;
}): CustomIntegrationFlow {
  const { agentId, autoGrant } = opts;
  const createMutation = useCreateCustomIntegration();
  const updateMutation = useUpdateCustomIntegration();
  const { mutateAsync: mutateGrant } = useAgentGrantMutation(agentId ?? "");

  const create = useCallback(
    async (ok: Extract<CreateResult, { ok: true }>) => {
      const connection = await createMutation.mutateAsync({
        ...ok.config,
        apiKey: ok.apiKey,
      });
      if (autoGrant && agentId) {
        try {
          await mutateGrant({
            connectionId: connection.connectionId,
            op: "add",
          });
        } catch {
          // Surfaced by call(); the integration itself was created.
        }
      }
      return connection;
    },
    [createMutation, autoGrant, agentId, mutateGrant],
  );

  const update = useCallback(
    (connectionId: string, patch: CustomPatch) =>
      updateMutation.mutateAsync({ connectionId, patch }),
    [updateMutation],
  );

  return {
    create,
    update,
    submitting: createMutation.isPending || updateMutation.isPending,
  };
}
