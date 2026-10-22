import { listAgents } from "../agents/http";
import type { HttpScope } from "../http";
import { getOrg } from "../org/http";
import { SkillTransferRefusalError } from "./transfer-types";

/**
 * The gateway scopes /agents to the active org but stamps every record with
 * its pod's internal workspace, Houston. Only the owner sees the full roster;
 * an admin's assigned-only list cannot prove a skill is unused elsewhere.
 */
export async function workspaceSkillAgents(
  scope: HttpScope,
  workspaceId: string,
) {
  if (workspaceId.startsWith("org:")) {
    const org = await getOrg(scope);
    if (`org:${org.slug}` !== workspaceId)
      throw new SkillTransferRefusalError("agent_not_in_workspace");
    if (org.role !== "owner")
      throw new SkillTransferRefusalError("workspace_not_owned");
    return listAgents(scope);
  }
  return (await listAgents(scope)).filter(
    (agent) => agent.workspaceId === workspaceId,
  );
}
