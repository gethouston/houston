import type {
  SkillDetail,
  SkillSummary,
} from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

export async function listSkills(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<SkillSummary[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills`);
  const items = (
    (await res.json()) as {
      items: Omit<SkillSummary, "inputs" | "promptTemplate">[];
    }
  ).items;
  // The host dropped the legacy structured-inputs/prompt-template fields (the UI
  // ignores them); restore them as empty so the v1 SkillSummary type is satisfied.
  return items.map((s) => ({ ...s, inputs: [], promptTemplate: null }));
}

/**
 * A single skill's full detail (its SKILL.md content) from the host's
 * `GET /agents/:id/skills/:slug`. Without this the adapter's Proxy fallback
 * stubbed skill detail to `[]`, so clicking any skill showed no content.
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
