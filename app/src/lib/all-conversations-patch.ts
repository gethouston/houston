import type { QueryClient } from "@tanstack/react-query";
import { sliceCoverage } from "./all-conversations-coverage";
import { sliceFreshness } from "./all-conversations-freshness";
import { tauriConversations } from "./tauri";

/**
 * Re-read ONE agent's slice of every cached cross-agent board.
 *
 * Deliberately not an `all-conversations` invalidation: that refetch fans out
 * one request to EVERY agent's pod, and in hosted mode each of those requests
 * resets the pod's idle-sleep clock. Only this agent's pod is touched, and the
 * sidebar badges / Mission Control read the patched cache unchanged.
 *
 * Rejects when the read fails; the caller decides what that costs.
 */
export async function patchAgentSlice(
  qc: QueryClient,
  agentPath: string,
): Promise<void> {
  // Stamped at the read: a sweep that started before this patch carries an
  // older slice for the agent and must not overwrite it on settle.
  sliceFreshness.notePatched(agentPath, Date.now());
  const rows = await tauriConversations.list(agentPath);
  sliceCoverage.noteRead([agentPath]);
  qc.setQueriesData<{ agent_path: string }[]>(
    { queryKey: ["all-conversations"] },
    (old) => old && [...old.filter((c) => c.agent_path !== agentPath), ...rows],
  );
}
