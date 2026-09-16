import {
  AGENT_COMMON_ROLES,
  AGENT_CONTEXT_ROLES,
} from "./agent-role-catalog-data.ts";

/** A curated industry an agent can be created for. */
export type AgentContextId = keyof typeof AGENT_CONTEXT_ROLES;

/** A concrete job an agent can be hired for. */
export type AgentRoleId =
  | (typeof AGENT_CONTEXT_ROLES)[AgentContextId][number]
  | (typeof AGENT_COMMON_ROLES)[number];

export const AGENT_CONTEXT_IDS = Object.keys(
  AGENT_CONTEXT_ROLES,
) as readonly AgentContextId[];

/** Every role the catalog knows, each one exactly once. */
export const AGENT_ROLE_IDS: readonly AgentRoleId[] = [
  ...new Set<AgentRoleId>([
    ...Object.values(AGENT_CONTEXT_ROLES).flat(),
    ...AGENT_COMMON_ROLES,
  ]),
];

export function isAgentContextId(value: unknown): value is AgentContextId {
  return (
    typeof value === "string" &&
    (AGENT_CONTEXT_IDS as readonly string[]).includes(value)
  );
}

export function isAgentRoleId(value: unknown): value is AgentRoleId {
  return (
    typeof value === "string" &&
    (AGENT_ROLE_IDS as readonly string[]).includes(value)
  );
}

/**
 * The roles offered for a context: the industry's own jobs first, then the ones
 * every industry shares. A context the user typed themselves has no catalog of
 * its own, so it is offered the shared list alone.
 *
 * The shared list drops anything the context already offers — the same job
 * twice in one screen reads as two different jobs.
 */
export function rolesForContext(contextId: AgentContextId | null): {
  own: readonly AgentRoleId[];
  common: readonly AgentRoleId[];
} {
  const own: readonly AgentRoleId[] = contextId
    ? AGENT_CONTEXT_ROLES[contextId]
    : [];
  return {
    own,
    common: AGENT_COMMON_ROLES.filter((role) => !own.includes(role)),
  };
}
