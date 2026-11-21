export function earlierHireIds(
  agents: readonly { id: string }[],
): ReadonlySet<string> {
  return new Set(agents.map((agent) => agent.id));
}

export function earlierHires<A extends { id: string }>(
  agents: readonly A[],
  ids: ReadonlySet<string> | null,
): A[] {
  if (ids === null) return [];
  return agents.filter((agent) => ids.has(agent.id));
}
