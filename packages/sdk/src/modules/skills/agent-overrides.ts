/**
 * The two acts one agent's Skills section performs on a WORKSPACE skill:
 * follow the workspace version again instead of the copy this agent keeps, and
 * stop loading the workspace skill on this agent at all.
 *
 * Neither is one write. A local copy loads whether or not the manifest names
 * it, so the manifest entry and the copy have to move together, and what makes
 * each act right is the ORDER: the copy — the only thing here nothing can
 * restore — goes last, after the reversible manifest write has landed. An
 * agent is therefore never left without the skill it asked to keep, and never
 * left running a copy it asked to drop.
 *
 * They compose {@link ./agent-manifest} and {@link ./agent-skills} and reach no
 * route of their own, and they live here rather than in the Skills screen so
 * every surface performs the same act by calling the same method.
 *
 * Neither is an assistant operation: the catalog is built from the functions
 * that issue a request, and these issue none. The assistant reaches the same
 * end through setSkillEnabled and deleteSkill, where the delete asks the
 * person first.
 */

import type { HttpScope } from "../http";
import { setSkillEnabled } from "./agent-manifest";
import { deleteSkill } from "./agent-skills";
import { AgentSkillsHttpError } from "./types-agent";

/**
 * Delete a copy that may already be gone. `404` is the host saying the agent
 * holds no such skill, which is the end state both acts ask for; every other
 * status is a delete that did not happen and reaches the caller.
 */
async function dropAgentCopy(
  scope: HttpScope,
  agentId: string,
  slug: string,
): Promise<void> {
  try {
    await deleteSkill(scope, agentId, slug);
  } catch (err) {
    if (!(err instanceof AgentSkillsHttpError) || err.status !== 404) throw err;
  }
}

/**
 * Puts an agent back on the workspace's version of a skill, dropping the agent's
 * own copy of it.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 */
export async function revertSkillOverride(
  scope: HttpScope,
  agentId: string,
  slug: string,
): Promise<void> {
  // The entry first: until the agent can load the workspace version, deleting
  // its own copy would take the skill away from it entirely.
  await setSkillEnabled(scope, agentId, slug, true);
  await dropAgentCopy(scope, agentId, slug);
}

/**
 * Stops one agent loading a workspace skill, and drops that agent's own copy of
 * it so nothing of the skill is left running there.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 */
export async function disableSkillForAgent(
  scope: HttpScope,
  agentId: string,
  slug: string,
): Promise<void> {
  // The entry first: it is the reversible half, so a failure here costs the
  // agent nothing it wrote.
  await setSkillEnabled(scope, agentId, slug, false);
  await dropAgentCopy(scope, agentId, slug);
}
