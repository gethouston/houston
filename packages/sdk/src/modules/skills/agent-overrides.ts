import type { HttpScope } from "../http";
import { setSkillEnabled } from "./agent-manifest";
import { deleteSkill } from "./agent-skills";
import { AgentSkillsHttpError } from "./types-agent";

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

export async function revertSkillOverride(
  scope: HttpScope,
  agentId: string,
  slug: string,
): Promise<void> {
  await setSkillEnabled(scope, agentId, slug, true);
  await dropAgentCopy(scope, agentId, slug);
}

export async function disableSkillForAgent(
  scope: HttpScope,
  agentId: string,
  slug: string,
): Promise<void> {
  await setSkillEnabled(scope, agentId, slug, false);
  await dropAgentCopy(scope, agentId, slug);
}
