import type { WireAgent } from "../agents/types";
import type { AgentSkillsFacade } from "./agent-facade";
import { localSkill } from "./share-new";
import { SkillTransferRefusalError } from "./transfer-types";
import type { SharedSkillsModule } from "./types-shared";

/**
 * Keeps the workspace version on one AI Employee. Every manifest must answer
 * before copying; the workspace copy is deleted only after the local version
 * is saved verbatim, enabled and verified. Refuses divergent local overrides.
 * A step that fails before the delete undoes the copy and the enable it made,
 * so a retry starts from the same state instead of a half-written override.
 * The holder check is read-then-delete: an enable another person lands after
 * the second check still loses the workspace copy, though this employee keeps it.
 *
 * Not an assistant operation: the catalog only records functions that issue a
 * request, and the manager's dispatcher sends one route per call. It reaches
 * the same end through loadSharedSkill, createSkill, saveSkill and
 * deleteSharedSkill, where the delete asks the person first.
 */
export async function keepSharedSkillForAgent(
  agent: AgentSkillsFacade,
  shared: SharedSkillsModule,
  listAgents: () => Promise<WireAgent[]>,
  workspaceId: string,
  agentId: string,
  slug: string,
): Promise<void> {
  /** Whether this employee's manifest already named the slug. */
  const checkHolders = async (): Promise<boolean> => {
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
    return manifests.some(
      (entry) => entry.id === agentId && entry.manifest.enabled.includes(slug),
    );
  };
  const wasEnabled = await checkHolders();
  const original = await shared.loadSharedSkill(workspaceId, slug);
  const local = await localSkill(agent, agentId, slug);
  if (local && local.content !== original.content)
    throw new SkillTransferRefusalError("local_copy_exists");
  // What this call wrote, so a failure undoes exactly that and nothing else.
  const wrote = { copy: false, verbatim: false, enabled: false };
  try {
    if (local === null) {
      // Create refuses a collision. Save restores all frontmatter verbatim;
      // create alone would wrap it in a second frontmatter block.
      await agent.createSkill(agentId, {
        name: slug,
        description: original.description || slug,
        content: original.content,
      });
      wrote.copy = true;
      await agent.saveSkill(agentId, slug, original.content);
      wrote.verbatim = true;
    }
    // Flagged first: a write whose answer was lost may still have landed.
    wrote.enabled = !wasEnabled;
    await agent.setSkillEnabled(agentId, slug, true);
    await checkHolders();
    const stored = await shared.loadSharedSkill(workspaceId, slug);
    const kept = await agent.loadSkill(agentId, slug);
    if (
      stored.content !== original.content ||
      kept.content !== original.content
    )
      throw new SkillTransferRefusalError("skill_changed");
  } catch (error) {
    await undoCopy(error, {
      agent,
      agentId,
      slug,
      content: original.content,
      ...wrote,
    });
    throw error;
  }
  await shared.deleteSharedSkill(workspaceId, slug);
}

/**
 * The store copy is still there, so the copy this call created goes. A copy
 * someone edited after the verbatim save is theirs and stays. An undo that
 * fails rides along with the original failure, never in its place.
 */
async function undoCopy(
  cause: unknown,
  step: {
    agent: AgentSkillsFacade;
    agentId: string;
    slug: string;
    content: string;
    copy: boolean;
    enabled: boolean;
    verbatim: boolean;
  },
): Promise<void> {
  const { agent, agentId, slug } = step;
  try {
    if (step.copy) {
      const current = await localSkill(agent, agentId, slug);
      const untouched = !step.verbatim || current?.content === step.content;
      if (current !== null && untouched) await agent.deleteSkill(agentId, slug);
    }
    if (step.enabled) await agent.setSkillEnabled(agentId, slug, false);
  } catch (undoError) {
    throw new AggregateError(
      [cause, undoError],
      "keeping the skill failed and its partial copy could not be undone",
    );
  }
}
