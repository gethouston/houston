import type { WorkspaceContext } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEngine } from "../../lib/engine";
import { queryKeys } from "../../lib/query-keys";

/**
 * Workspace + user context = the two blobs injected into every chat's system
 * prompt (HOU-711). The engine adapter picks the backing store by deployment:
 *
 *  - CLOUD — Supabase, via the gateway (`/v1/workspace-context`, `/v1/user-context`).
 *    Org-wide + per-user, spliced into each turn; nothing on the agent volume.
 *  - LOCAL / self-host — `WORKSPACE.md` + `USER.md` files on the agent, read the
 *    same way as its CLAUDE.md instructions.
 *
 * Both surface here as `{ workspace, user }`. Keyed by the open agent's path: in
 * cloud the agent is ignored by the adapter (context is org/user-scoped), but the
 * key keeps the query stable and lets the file-watcher invalidation (local) hit.
 */
type Slot = "workspace" | "user";

/**
 * `getEngine()` is typed as the legacy engine-client, but the running instance is
 * the v3 adapter (`packages/web/src/engine-adapter`), which exposes the
 * deployment-aware context methods. Narrow to just those (same cast pattern as
 * `claude-login-remote.ts`).
 */
interface WorkspaceContextEngine {
  getWorkspaceContext(agentPath: string): Promise<WorkspaceContext>;
  setWorkspaceContextSlot(
    agentPath: string,
    slot: Slot,
    content: string,
  ): Promise<void>;
}
const contextEngine = (): WorkspaceContextEngine =>
  getEngine() as unknown as WorkspaceContextEngine;

export function useWorkspaceContext(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaceContext(agentPath ?? ""),
    queryFn: (): Promise<WorkspaceContext> => {
      if (!agentPath) throw new Error("agentPath is required");
      return contextEngine().getWorkspaceContext(agentPath);
    },
    enabled: !!agentPath,
  });
}

export function useSaveWorkspaceContext(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slot, content }: { slot: Slot; content: string }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return contextEngine().setWorkspaceContextSlot(agentPath, slot, content);
    },
    onSuccess: (_res, { slot, content }) => {
      if (!agentPath) return;
      qc.setQueryData<WorkspaceContext>(
        queryKeys.workspaceContext(agentPath),
        (prev) => ({ workspace: "", user: "", ...prev, [slot]: content }),
      );
    },
  });
}
