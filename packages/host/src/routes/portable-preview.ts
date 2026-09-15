import type { IncomingMessage, ServerResponse } from "node:http";
import { loadLearnings, loadRoutines, loadSkills } from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * What the "Share with a friend" wizard shows on its pick screen: the agent's
 * exportable content (instructions + skills + routines + learnings) with
 * enough detail to render a row per item. Read-only; the actual export is
 * `POST .../portable/export` (routes/portable.ts).
 */

/** One line, capped — enough for a preview row, never the whole document. */
function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

/**
 * GET .../portable/preview → the agent-side export inventory. Returns true
 * when handled.
 */
export async function handlePortablePreview(
  deps: { vfs?: Vfs; paths?: WorkspacePaths },
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (rest !== "portable/preview" || method !== "GET") return false;
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const paths = deps.paths ?? new CloudPaths();
  const root = paths.agentRoot(ctx.workspace, ctx.agent);

  const md = await deps.vfs.readText(`${root}/CLAUDE.md`);
  const { items: skills } = await loadSkills(deps.vfs, root);
  const { items: routines } = await loadRoutines(deps.vfs, root);
  const { items: learnings } = await loadLearnings(deps.vfs, root);

  json(res, 200, {
    claudeMd:
      md !== null && md.trim() !== ""
        ? { byteCount: Buffer.byteLength(md, "utf8"), excerpt: excerpt(md) }
        : null,
    skills: skills.map((s) => ({
      slug: s.name,
      description: s.description,
      category: s.category,
      image: s.image,
      integrations: s.integrations,
      featured: s.featured,
    })),
    routines: routines.map((r) => ({
      id: r.id,
      name: r.name,
      promptExcerpt: excerpt(r.prompt),
      schedule: r.schedule,
      enabled: r.enabled,
      integrations: r.integrations,
    })),
    learnings: learnings.map((l) => ({
      id: l.id,
      text: l.text,
      createdAt: l.created_at,
    })),
  });
  return true;
}

/**
 * A wrong method here must NOT 405: the check above declines it, so the
 * request carries on down the dispatch chain to the agent's runtime.
 */
defineRoute({
  group: "portable-preview",
  method: "GET",
  path: "/agents/:agentId/portable/preview",
  phase: "agent",
  classification: "sdk",
  methodMismatch: "fallthrough",
  source: "packages/host/src/routes/portable-preview.ts",
  handler: async ({ deps, authz, method, path, req, res }) => {
    await handlePortablePreview(
      { vfs: deps.vfs, paths: deps.paths ?? DEFAULT_PATHS },
      authz,
      method,
      agentRest(path),
      req,
      res,
    );
  },
});
