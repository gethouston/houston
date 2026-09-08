/**
 * HOW a written agent reference resolves to an agent — one ladder, over one
 * shape, for every surface that lets a caller NAME an agent.
 *
 * The surfaces disagreeing is the bug this prevents: the mission routes
 * retarget a board at a named agent (missions-target.ts), the assistant
 * dispatcher resolves the agent parameter of a catalogued operation, and a
 * reference one accepts and the other spells differently is Houston acting on
 * the wrong agent. Reachability — WHICH agents are candidates at all — is the
 * caller's question (reachable-agents.ts for a store, missions-directory.ts for
 * a deployment that spans pods); this module only decides which of them a
 * string names.
 *
 * A candidate is a flat reference rather than a workspace/agent pair because a
 * candidate is not always local: an agent in another pod is known by the slug
 * and space its gateway reports, with no `Workspace` object behind it.
 */

/** An agent as a reference names it. */
export interface AgentRef {
  /** How this agent is addressed: its id here, or its slug in another pod. */
  id: string;
  name: string;
  /** The space it lives in, and the qualifier in `<Space>/<Agent>`. Empty when
   *  the space has no name the caller would recognize. */
  workspace: string;
  /** Also accepted as the qualifier (a workspace id reads as its own name). */
  workspaceId: string;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** `<Space>/<Agent>` — how a caller separates two agents that share a name. */
export function qualifiedAgentRef(ref: AgentRef): string {
  return ref.workspace ? `${ref.workspace}/${ref.name}` : ref.name;
}

/** One agent as a listing line, so every agent-facing surface spells it alike. */
export function describeAgentRef(ref: AgentRef): string {
  return ref.workspace
    ? `${ref.name} (id ${ref.id}, in ${ref.workspace})`
    : `${ref.name} (id ${ref.id})`;
}

/** Every candidate, spelled so the reader can pick one and try again. */
export function agentRefDirectory(refs: readonly AgentRef[]): string {
  return refs.map(describeAgentRef).join(", ");
}

/**
 * Every candidate a written reference names: its id, `<Space>/<Agent>` (the
 * space by name or by id), or its bare name — case-insensitively, most
 * specific tier first, each tier answering on its own.
 *
 * An id is unique, so a hit on it is the whole answer; the name tiers below it
 * exist for what people say, and a bare name that two spaces both use is
 * genuinely two answers. The caller refuses those rather than picking one:
 * guessing puts the work on a board the user never looks at.
 */
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
