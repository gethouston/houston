export interface RenamedAgent {
  id: string;
}

interface RenameAgentFollowUpInput {
  workspaceId: string;
  agentId: string;
  name: string;
  renameAgent: (
    workspaceId: string,
    agentId: string,
    name: string,
  ) => Promise<RenamedAgent>;
  remapAgentId: (oldId: string, newId: string) => void;
}

/** Rename an agent, preserving sidebar placement if its folder-derived id moved. */
export async function renameAgentWithFollowUp({
  workspaceId,
  agentId,
  name,
  renameAgent,
  remapAgentId,
}: RenameAgentFollowUpInput): Promise<RenamedAgent> {
  const updated = await renameAgent(workspaceId, agentId, name);
  if (updated.id !== agentId) remapAgentId(agentId, updated.id);
  return updated;
}
