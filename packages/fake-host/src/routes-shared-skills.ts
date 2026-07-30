import { SEED_WORKSPACE_ID } from "./config";
import { json } from "./http";
import * as state from "./state";

export function handleSharedSkillsRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (
    segs[0] !== "v1" ||
    segs[1] !== "workspaces" ||
    segs[3] !== "shared-skills" ||
    segs.length > 5
  ) {
    return undefined;
  }
  const workspaceId = decodeURIComponent(segs[2] ?? "");
  if (!state.isKnownWorkspace(workspaceId, SEED_WORKSPACE_ID)) {
    return json({ error: "workspace not found" }, 404);
  }
  const slug = segs[4] ? decodeURIComponent(segs[4]) : null;

  if (!slug && method === "GET") {
    return json(state.listSharedSkills(workspaceId));
  }
  if (!slug && method === "POST") {
    const name = typeof body?.name === "string" ? body.name : "";
    const description =
      typeof body?.description === "string" ? body.description : "";
    const content = typeof body?.content === "string" ? body.content : "";
    if (!name || !description || !content) {
      return json({ error: "missing shared skill field" }, 400);
    }
    if (!state.sharedSkillSlug(name)) {
      return json({ error: "name does not produce a usable slug" }, 400);
    }
    const created = state.createSharedSkill(workspaceId, {
      name,
      description,
      content,
    });
    return created
      ? json(created, 201)
      : json({ error: "shared skill already exists" }, 409);
  }
  if (slug && method === "GET") {
    const detail = state.loadSharedSkill(workspaceId, slug);
    return detail
      ? json(detail)
      : json({ error: "shared skill not found" }, 404);
  }
  if (slug && method === "PUT") {
    const content = typeof body?.content === "string" ? body.content : "";
    if (!content) return json({ error: "missing 'content'" }, 400);
    return state.saveSharedSkill(workspaceId, slug, content)
      ? json({ ok: true })
      : json({ error: "shared skill not found" }, 404);
  }
  if (slug && method === "DELETE") {
    return state.deleteSharedSkill(workspaceId, slug)
      ? json({ ok: true })
      : json({ error: "shared skill not found" }, 404);
  }
  return json({ error: "method not allowed" }, 405);
}
