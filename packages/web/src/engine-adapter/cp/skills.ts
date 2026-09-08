import type {
  SkillDetail,
  SkillSummary,
  SkillsManifest,
} from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Per-AGENT skills: the skills that live in one agent's own `.agents/skills/`,
 * plus that agent's skills manifest. The workspace-scoped shared library is a
 * different family — see `shared-skills.ts`, which reuses the host→client
 * summary shim exported here.
 */

export type HostSkillSummary = Omit<SkillSummary, "inputs" | "promptTemplate">;

export function toClientSummary(summary: HostSkillSummary): SkillSummary {
  return { ...summary, inputs: [], promptTemplate: null };
}

/**
 * Lists the skills an agent can follow.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:skills
 */
export async function listSkills(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<SkillSummary[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills`);
  const items = ((await res.json()) as { items: HostSkillSummary[] }).items;
  // The host dropped the legacy structured-inputs/prompt-template fields (the UI
  // ignores them); restore them as empty so the v1 SkillSummary type is satisfied.
  return items.map(toClientSummary);
}

/**
 * Reads a skill's instructions.
 *
 * A single skill's full detail (its SKILL.md content) from the host's
 * `GET /agents/:id/skills/:slug`. Without this the adapter's Proxy fallback
 * stubbed skill detail to `[]`, so clicking any skill showed no content.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @assistant group:skills
 */
export async function loadSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  slug: string,
): Promise<SkillDetail> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/${encodeURIComponent(slug)}`,
  );
  return (await res.json()) as SkillDetail;
}

/**
 * Creates a skill an agent can follow.
 *
 * Confirmed: a skill is standing instruction. Once it exists the agent follows
 * it in every later turn, changing behavior the user never asked for again.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param body The new skill: its name, a one-line description, and the
 *   instructions themselves.
 * @assistant group:skills confirm
 */
export async function createSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  body: { name: string; description: string; content: string },
): Promise<void> {
  await cpFetch(cfg, `${agentPath(agentId)}/skills`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
/**
 * Saves changes to a skill's instructions.
 *
 * Confirmed: irreversible. It overwrites the skill's text in place and Houston
 * keeps no earlier copy, so what the user wrote cannot be recovered.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @param content The skill's full new text. It replaces what was there, so
 *   send the whole thing.
 * @assistant group:skills confirm
 */
export async function saveSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  slug: string,
  content: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    },
  );
}
/**
 * Deletes a skill so the agent no longer has it.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @assistant group:skills confirm
 */
export async function deleteSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  slug: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

/**
 * Reads which of an agent's skills are switched on.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:skills
 */
export async function getSkillsManifest(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<SkillsManifest> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills-manifest`);
  return (await res.json()) as SkillsManifest;
}

/**
 * Chooses which of an agent's skills are switched on.
 *
 * Not confirmed: trivially reversible. Nothing is created or destroyed, and
 * switching one back restores exactly the previous state.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param manifest The complete enabled skill list. Every omitted skill is
 *   disabled. Read getSkillsManifest first and send the full revised
 *   manifest.
 * @assistant group:skills confirm
 */
export async function putSkillsManifest(
  cfg: ControlPlaneConfig,
  agentId: string,
  manifest: SkillsManifest,
): Promise<SkillsManifest> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills-manifest`, {
    method: "PUT",
    body: JSON.stringify(manifest),
  });
  return (await res.json()) as SkillsManifest;
}
