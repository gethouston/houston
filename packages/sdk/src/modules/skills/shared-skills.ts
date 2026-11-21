import type { ModuleContext } from "../../module-context";
import { type HttpScope, httpRequest, moduleScope } from "../http";
import { requireString } from "../payload";
import {
  type HostSharedSkillsList,
  type NewSharedSkill,
  requireNewSharedSkill,
  SharedSkillsCommand,
  SharedSkillsHttpError,
  type SharedSkillsList,
  type SharedSkillsModule,
  type SkillDetail,
  toSharedSummary,
} from "./types-shared";

/**
 * Lists the skills shared with everyone in a workspace.
 * @param workspaceId The workspace these belong to, by the id
 *   listWorkspaces returns.
 * @assistant group:skills
 */
export async function listSharedSkills(
  scope: HttpScope,
  workspaceId: string,
): Promise<SharedSkillsList> {
  const res = await httpRequest(
    scope,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills`,
  );
  const body = (await res.json()) as HostSharedSkillsList;
  return { ...body, items: body.items.map(toSharedSummary) };
}

/**
 * Reads the instructions of a skill shared with the workspace.
 * @param workspaceId The workspace these belong to, by the id
 *   listWorkspaces returns.
 * @param slug The shared skill's exact slug, from listSharedSkills. Never
 *   invent one.
 * @assistant group:skills
 */
export async function loadSharedSkill(
  scope: HttpScope,
  workspaceId: string,
  slug: string,
): Promise<SkillDetail> {
  const res = await httpRequest(
    scope,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
  );
  return (await res.json()) as SkillDetail;
}

/**
 * Creates a skill and shares it with everyone in the workspace.
 * @param workspaceId The workspace these belong to, by the id
 *   listWorkspaces returns.
 * @param body The new shared skill: its name, a one-line description, and
 *   the instructions themselves.
 * @assistant group:skills unconfirmed: Adds a new shared skill without changing or removing an existing one.
 */
export async function createSharedSkill(
  scope: HttpScope,
  workspaceId: string,
  body: NewSharedSkill,
): Promise<SkillDetail> {
  const res = await httpRequest(
    scope,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return (await res.json()) as SkillDetail;
}

/**
 * Shares an agent's existing skill with everyone in the workspace.
 * @param workspaceId The workspace these belong to, by the id
 *   listWorkspaces returns.
 * @param slug The shared skill's exact slug, from listSharedSkills. Never
 *   invent one.
 * @param content The skill's full text as it should be shared.
 * @assistant group:skills
 * @assistant confirm: outward. It publishes the skill to everyone in the workspace, and a shared skill already under that name is refused rather than replaced.
 */
export async function promoteSharedSkill(
  scope: HttpScope,
  workspaceId: string,
  slug: string,
  content: string,
): Promise<SkillDetail> {
  const res = await httpRequest(
    scope,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
  return (await res.json()) as SkillDetail;
}

/**
 * Saves changes to a skill shared with the workspace, for everyone who uses it.
 * @param workspaceId The workspace these belong to, by the id
 *   listWorkspaces returns.
 * @param slug The shared skill's exact slug, from listSharedSkills. Never
 *   invent one.
 * @param content The skill's full new text. It replaces what was there, so
 *   send the whole thing.
 * @assistant group:skills
 * @assistant confirm: irreversible. It replaces the shared skill's text for everyone at once, and no earlier version is kept.
 */
export async function saveSharedSkill(
  scope: HttpScope,
  workspaceId: string,
  slug: string,
  content: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
    { method: "PUT", body: JSON.stringify({ content }) },
  );
}

/**
 * Deletes a skill shared with the workspace, removing it for everyone.
 * @param workspaceId The workspace these belong to, by the id
 *   listWorkspaces returns.
 * @param slug The shared skill's exact slug, from listSharedSkills. Never
 *   invent one.
 * @assistant group:skills
 * @assistant confirm: irreversible. The skill disappears for everyone in the workspace and no copy is kept.
 */
export async function deleteSharedSkill(
  scope: HttpScope,
  workspaceId: string,
  slug: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/shared-skills/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

export function createSharedSkills(ctx: ModuleContext): SharedSkillsModule {
  const scope = moduleScope(ctx, "shared-skills", SharedSkillsHttpError);

  const wid = (p: unknown) => requireString(p, "workspaceId");
  const slug = (p: unknown) => requireString(p, "slug");
  const text = (p: unknown) => requireString(p, "content");

  ctx.registerCommand(SharedSkillsCommand.List, (p) =>
    listSharedSkills(scope, wid(p)),
  );
  ctx.registerCommand(SharedSkillsCommand.Load, (p) =>
    loadSharedSkill(scope, wid(p), slug(p)),
  );
  ctx.registerCommand(SharedSkillsCommand.Create, (p) =>
    createSharedSkill(scope, wid(p), requireNewSharedSkill(p, "body")),
  );
  ctx.registerCommand(SharedSkillsCommand.Promote, (p) =>
    promoteSharedSkill(scope, wid(p), slug(p), text(p)),
  );
  ctx.registerCommand(SharedSkillsCommand.Save, (p) =>
    saveSharedSkill(scope, wid(p), slug(p), text(p)),
  );
  ctx.registerCommand(SharedSkillsCommand.Delete, (p) =>
    deleteSharedSkill(scope, wid(p), slug(p)),
  );

  return {
    listSharedSkills: (workspaceId) => listSharedSkills(scope, workspaceId),
    loadSharedSkill: (workspaceId, slug) =>
      loadSharedSkill(scope, workspaceId, slug),
    createSharedSkill: (workspaceId, body) =>
      createSharedSkill(scope, workspaceId, body),
    promoteSharedSkill: (workspaceId, slug, content) =>
      promoteSharedSkill(scope, workspaceId, slug, content),
    saveSharedSkill: (workspaceId, slug, content) =>
      saveSharedSkill(scope, workspaceId, slug, content),
    deleteSharedSkill: (workspaceId, slug) =>
      deleteSharedSkill(scope, workspaceId, slug),
  };
}
