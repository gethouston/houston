export interface AgentRef {
  id: string;
  name: string;
  workspace: string;
  workspaceId: string;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function qualifiedAgentRef(ref: AgentRef): string {
  return ref.workspace ? `${ref.workspace}/${ref.name}` : ref.name;
}

export function describeAgentRef(ref: AgentRef): string {
  return ref.workspace
    ? `${ref.name} (id ${ref.id}, in ${ref.workspace})`
    : `${ref.name} (id ${ref.id})`;
}

export function agentRefDirectory(refs: readonly AgentRef[]): string {
  return refs.map(describeAgentRef).join(", ");
}

export function matchAgentRefs<T extends AgentRef>(
  candidates: readonly T[],
  ref: string,
): T[] {
  const wanted = ref.trim();
  const byId = candidates.filter((c) => c.id === wanted);
  if (byId.length > 0) return byId;
  const qualified = candidates.filter(
    (c) =>
      eq(`${c.workspace}/${c.name}`, wanted) ||
      eq(`${c.workspaceId}/${c.name}`, wanted),
  );
  if (qualified.length > 0) return qualified;
  return candidates.filter((c) => eq(c.name, wanted));
}
