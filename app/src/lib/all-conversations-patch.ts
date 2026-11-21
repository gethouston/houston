import type { QueryClient } from "@tanstack/react-query";
import { sliceCoverage } from "./all-conversations-coverage";
import { sliceFreshness } from "./all-conversations-freshness";
import { tauriConversations } from "./conversations-facade";

export async function patchAgentSlice(
  qc: QueryClient,
  agentPath: string,
): Promise<void> {
  sliceFreshness.notePatched(agentPath, Date.now());
  const rows = await tauriConversations.list(agentPath);
  sliceCoverage.noteRead([agentPath]);
  qc.setQueriesData<{ agent_path: string }[]>(
    { queryKey: ["all-conversations"] },
    (old) => old && [...old.filter((c) => c.agent_path !== agentPath), ...rows],
  );
}
