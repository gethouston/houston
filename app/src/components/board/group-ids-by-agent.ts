export function groupIdsByAgent(
  ids: string[],
  agentPathForId: (id: string) => string | undefined,
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const id of ids) {
    const agentPath = agentPathForId(id);
    if (!agentPath) continue;
    if (groups[agentPath] === undefined) {
      groups[agentPath] = [];
    }
    groups[agentPath].push(id);
  }
  return groups;
}
