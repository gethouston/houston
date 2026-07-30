import type {
  SkillDetail,
  SkillSummary,
  SkillsManifest,
} from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

type HostSkillSummary = Omit<SkillSummary, "inputs" | "promptTemplate">;

function toClientSummary(summary: HostSkillSummary): SkillSummary {
  return { ...summary, inputs: [], promptTemplate: null };
}

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

export async function listSharedSkills(
  cfg: ControlPlaneConfig,
  workspaceId: string,
): Promise<{
  items: SkillSummary[];
  diagnostics: { key: string; message: string }[];
}> {
  const res = await cpFetch(
    cfg,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills`,
  );
  const body = (await res.json()) as {
    items: HostSkillSummary[];
    diagnostics: { key: string; message: string }[];
  };
  return { ...body, items: body.items.map(toClientSummary) };
}

export async function loadSharedSkill(
  cfg: ControlPlaneConfig,
  workspaceId: string,
  slug: string,
): Promise<SkillDetail> {
  const res = await cpFetch(
    cfg,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
  );
  return (await res.json()) as SkillDetail;
}

export async function createSharedSkill(
  cfg: ControlPlaneConfig,
  workspaceId: string,
  body: { name: string; description: string; content: string },
): Promise<SkillDetail> {
  const res = await cpFetch(
    cfg,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return (await res.json()) as SkillDetail;
}

export async function saveSharedSkill(
  cfg: ControlPlaneConfig,
  workspaceId: string,
  slug: string,
  content: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
    { method: "PUT", body: JSON.stringify({ content }) },
  );
}

export async function deleteSharedSkill(
  cfg: ControlPlaneConfig,
  workspaceId: string,
  slug: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

export async function getSkillsManifest(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<SkillsManifest> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills-manifest`);
  return (await res.json()) as SkillsManifest;
}

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
