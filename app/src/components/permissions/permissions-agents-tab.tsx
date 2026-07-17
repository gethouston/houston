import type { OrgMember } from "@houston-ai/engine-client";
import type { Agent } from "../../lib/types";
import { AgentsList } from "./agents-list";

/**
 * Permissions > Agents: the agent list. Each agent drills into its per-agent
 * card ({@link AgentDetail}), where a manager sets that one agent's integration +
 * model ceilings. Policy is per agent only — there are no workspace-wide default
 * ceilings (removed as overengineering).
 *
 * The view already gates to multiplayer owner/admin, so this never mounts in
 * single-player or for a plain member.
 */
export function PermissionsAgentsTab({
  members,
  onOpenAgent,
}: {
  members: OrgMember[];
  onOpenAgent: (agent: Agent) => void;
}) {
  return <AgentsList members={members} onOpenAgent={onOpenAgent} />;
}
