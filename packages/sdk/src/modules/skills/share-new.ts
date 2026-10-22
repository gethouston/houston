import type { AgentSkillsFacade } from "./agent-facade";
import type { SkillShareHooks, SkillShareResult } from "./transfer-types";
import { AgentSkillsHttpError } from "./types-agent";
import { SharedSkillsHttpError, type SharedSkillsModule } from "./types-shared";

/** Store absence, policy and collisions leave the employee's copy usable. */
function shareDeclined(error: unknown): boolean {
  if (!(error instanceof SharedSkillsHttpError)) return false;
  if ([403, 404, 409].includes(error.status)) return true;
  if (error.status !== 503) return false;
  try {
    const body: unknown = JSON.parse(error.message);
    return (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      body.error === "shared skills not configured"
    );
  } catch {
    // An unparseable 503 is still a failure, never evidence of no store.
    return false;
  }
}

export async function localSkill(
  agent: AgentSkillsFacade,
  agentId: string,
  slug: string,
) {
  try {
    return await agent.loadSkill(agentId, slug);
  } catch (error) {
    if (error instanceof AgentSkillsHttpError && error.status === 404)
      return null;
    throw error;
  }
}

/**
 * Shares a newly created skill and enables only its creator. The local copy
 * survives any failure, and a concurrent edit survives as an override.
 * Not an assistant operation, for the reason keepSharedSkillForAgent gives.
 */
export async function shareNewSkillToWorkspace(
  agent: AgentSkillsFacade,
  shared: SharedSkillsModule,
  workspaceId: string,
  agentId: string,
  slug: string,
  hooks?: SkillShareHooks,
): Promise<SkillShareResult> {
  const original = await localSkill(agent, agentId, slug);
  if (original === null) return { outcome: "skipped" };
  try {
    await shared.promoteSharedSkill(workspaceId, slug, original.content);
  } catch (error) {
    if (shareDeclined(error)) return { outcome: "kept-local" };
    throw error;
  }
  await agent.setSkillEnabled(agentId, slug, true);
  await hooks?.beforeDelete?.();
  const current = await localSkill(agent, agentId, slug);
  if (current === null)
    return { outcome: "shared", creatorEnabled: true, localDeleted: true };
  if (current.content !== original.content)
    return { outcome: "shared", creatorEnabled: true, localDeleted: false };
  await agent.deleteSkill(agentId, slug);
  return { outcome: "shared", creatorEnabled: true, localDeleted: true };
}
