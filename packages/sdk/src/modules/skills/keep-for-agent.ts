import type { WireAgent } from "../agents/types";
import type { AgentSkillsFacade } from "./agent-facade";
import { localSkill } from "./share-new";
import { SkillTransferRefusalError } from "./transfer-types";
import type { SharedSkillsModule } from "./types-shared";

/**
 * Keeps the workspace version on one AI Employee. Every manifest must answer
 * before copying; the workspace copy is deleted only after the local version
 * is saved verbatim, enabled and verified. Refuses divergent local overrides.
 * @assistant group:skills
 * @assistant confirm: outward. Removes the workspace copy after preserving it on this employee.
 */
export async function keepSharedSkillForAgent(
  agent: AgentSkillsFacade,
  shared: SharedSkillsModule,
  listAgents: () => Promise<WireAgent[]>,
  workspaceId: string,
  agentId: string,
  slug: string,
): Promise<void> {
  const checkHolders = async () => {
    const employees = await listAgents();
    if (!employees.some((a) => a.id === agentId))
      throw new SkillTransferRefusalError("agent_not_in_workspace");
    const manifests = await Promise.all(
      employees.map(async (employee) => ({
        id: employee.id,
        manifest: await agent.getSkillsManifest(employee.id),
      })),
    );
    if (
      manifests.some(
        (entry) =>
          entry.id !== agentId && entry.manifest.enabled.includes(slug),
      )
    )
      throw new SkillTransferRefusalError("enabled_elsewhere");
  };
  await checkHolders();
  const original = await shared.loadSharedSkill(workspaceId, slug);
  const local = await localSkill(agent, agentId, slug);
  if (local && local.content !== original.content)
    throw new SkillTransferRefusalError("local_copy_exists");
  if (local === null) {
    // Create refuses a collision. Save restores all frontmatter verbatim;
    // create alone would wrap it in a second frontmatter block.
    await agent.createSkill(agentId, {
      name: slug,
      description: original.description || slug,
      content: original.content,
    });
    await agent.saveSkill(agentId, slug, original.content);
  }
  await agent.setSkillEnabled(agentId, slug, true);
  await checkHolders();
  const stored = await shared.loadSharedSkill(workspaceId, slug);
  const kept = await agent.loadSkill(agentId, slug);
  if (stored.content !== original.content || kept.content !== original.content)
    throw new SkillTransferRefusalError("skill_changed");
  await shared.deleteSharedSkill(workspaceId, slug);
}
