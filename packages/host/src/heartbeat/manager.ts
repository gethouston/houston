import type { AgentId, Workspace } from "../domain/types";
import type { ChannelCtx, WorkspaceStore } from "../ports";
import { ASSISTANT_AGENT_NAME } from "../routes/assistant";

export async function managerContext(
  deps: {
    store: WorkspaceStore;
    ensureAgentDir: (agentId: AgentId) => void;
  },
  ws: Workspace,
): Promise<ChannelCtx> {
  const agentId: AgentId = `${ws.id}/${ASSISTANT_AGENT_NAME}`;
  deps.ensureAgentDir(agentId);
  const agent = await deps.store.getAgent(agentId);
  if (!agent) throw new Error(`the AI Manager ${agentId} has no directory`);
  return { workspace: ws, agent };
}
