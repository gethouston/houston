/**
 * Group mission ids by their owning agent path.
 *
 * Mission Control's multi-select spans agents, but every bulk mutation
 * (`tauriActivity.bulkUpdate` / `bulkDelete`) is scoped to a single agent. So
 * a cross-agent bulk action fans out into one call per agent — this pure
 * helper does the grouping (and is unit-tested independently of React).
 *
 * Ids whose agent can't be resolved (a card that fell out of the view between
 * selection and dispatch) are dropped rather than misrouted.
 */
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
