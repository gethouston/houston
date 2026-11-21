import type { Agent, Capabilities } from "@houston/engine-adapter";
import { isMultiplayer, orgRole } from "./org-roles.ts";

export function isAgentManager(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  if (!isMultiplayer(caps)) return true;
  if (orgRole(caps) === "owner") return true;
  return agent.access === "manager";
}

export const canEditAgentConfig = isAgentManager;

export function canManageAssignments(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return isAgentManager(caps, agent);
}
