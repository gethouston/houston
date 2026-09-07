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
 * @assistant group:skills
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
 * @assistant group:skills
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
