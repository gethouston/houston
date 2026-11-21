import {
  AGENT_COMMON_ROLES,
  AGENT_CONTEXT_ROLES,
} from "./agent-role-catalog-data.ts";

export type AgentContextId = keyof typeof AGENT_CONTEXT_ROLES;

export type AgentRoleId =
  | (typeof AGENT_CONTEXT_ROLES)[AgentContextId][number]
  | (typeof AGENT_COMMON_ROLES)[number];

export const AGENT_CONTEXT_IDS = Object.keys(
  AGENT_CONTEXT_ROLES,
) as readonly AgentContextId[];

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
