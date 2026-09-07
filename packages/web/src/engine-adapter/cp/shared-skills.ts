import type {
  SkillDetail,
  SkillSummary,
} from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";
import { type HostSkillSummary, toClientSummary } from "./skills";

/**
 * WORKSPACE-scoped shared skills (`/v1/workspaces/:id/shared-skills`): the
 * library every agent in a space can draw from, including promotion of an
 * agent's own skill into it. Per-agent skills live in `skills.ts`.
 */

/**
 * Lists the skills shared with everyone in a workspace.
 * @assistant group:skills
 */
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

/**
 * Reads the instructions of a skill shared with the workspace.
 * @assistant group:skills
 */
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

/**
 * Creates a skill and shares it with everyone in the workspace.
 * @assistant group:skills confirm
 */
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

/**
 * Shares an agent's existing skill with everyone in the workspace.
 * @assistant group:skills confirm
 */
export async function promoteSharedSkill(
  cfg: ControlPlaneConfig,
  workspaceId: string,
  slug: string,
  content: string,
): Promise<SkillDetail> {
  const res = await cpFetch(
    cfg,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
  return (await res.json()) as SkillDetail;
}

/**
 * Saves changes to a skill shared with the workspace, for everyone who uses it.
 * @assistant group:skills confirm
 */
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

/**
 * Deletes a skill shared with the workspace, removing it for everyone.
 * @assistant group:skills confirm
 */
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
