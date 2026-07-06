import type { WorkspaceContext } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";

/**
 * Workspace + user context = two markdown files at the agent's workspace root,
 * `WORKSPACE.md` and `USER.md`, that the runtime injects into every chat's
 * system prompt at session start. They are ordinary agent files, persisted and
 * kept reactive exactly like the agent's own CLAUDE.md instructions (see
 * `use-instructions.ts`).
 *
 * Keyed by agent PATH, not workspace id: the hosted gateway only reaches a pod
 * through `/agents/:slug/*`, and each agent's runtime reads its OWN copy — so
 * there is nowhere workspace-level to store this that both persists and reaches
 * the prompt. Backing them onto the current agent is what actually makes the
 * text survive navigation AND reach the agent (HOU-711); the old adapter stub
 * did neither.
 */
const WORKSPACE_MD = "WORKSPACE.md";
const USER_MD = "USER.md";

export function useWorkspaceContext(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaceContext(agentPath ?? ""),
    queryFn: async (): Promise<WorkspaceContext> => {
      if (!agentPath) throw new Error("agentPath is required");
      // The host answers a missing file with "" (not a 404), so absent files
      // read back as empty and the editor shows its empty state.
      const [workspace, user] = await Promise.all([
        tauriAgent.readFile(agentPath, WORKSPACE_MD),
        tauriAgent.readFile(agentPath, USER_MD),
      ]);
      return { workspace, user };
    },
    enabled: !!agentPath,
  });
}

export function useSaveWorkspaceContext(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: WorkspaceContext): Promise<WorkspaceContext> => {
      if (!agentPath) throw new Error("agentPath is required");
      await Promise.all([
        tauriAgent.writeFile(agentPath, WORKSPACE_MD, body.workspace),
        tauriAgent.writeFile(agentPath, USER_MD, body.user),
      ]);
      return body;
    },
    onSuccess: (data) => {
      if (agentPath)
        qc.setQueryData(queryKeys.workspaceContext(agentPath), data);
    },
  });
}
