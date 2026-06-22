import type { IncomingMessage, ServerResponse } from "node:http";
import type { PortableSelection } from "@houston/protocol";
import {
  loadLearnings,
  loadRoutines,
  loadSkillDetail,
  packAgent,
  portableInventory,
  saveLearnings,
  saveRoutines,
  seedSchemas,
  skillKey,
  unpackAgent,
  type PortableContent,
} from "@houston/domain";
import type { Agent, UserId, Workspace } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import { json, readJson } from "./http";

/** Bumped independently of the wire protocol; rides in the manifest. */
const HOUSTON_VERSION = "0.0.0";

async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const ctxFile = (root: string) => `${root}/CLAUDE.md`;

/**
 * Export an agent as a `.houstonagent` (agent-scoped: POST
 * .../portable/export with a PortableSelection). Gathers the selected content
 * off the vfs and returns the zip. Returns true when handled.
 */
export async function handlePortableExport(
  deps: { vfs?: Vfs; paths?: WorkspacePaths },
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (rest !== "portable/export" || method !== "POST") return false;
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const paths = deps.paths ?? new CloudPaths();
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  const sel = (await readJson(req)) as PortableSelection;

  const content: PortableContent = { skills: [], routines: [], learnings: [] };
  if (sel.includeClaudeMd) {
    const md = await deps.vfs.readText(ctxFile(root));
    if (md !== null) content.claudeMd = md;
  }
  if (sel.skillSlugs?.length) {
    for (const slug of sel.skillSlugs) {
      const detail = await loadSkillDetail(deps.vfs, root, slug);
      if (detail) content.skills.push({ slug, body: detail.content });
    }
  }
  if (sel.routineIds?.length) {
    const { items } = await loadRoutines(deps.vfs, root);
    content.routines = items.filter((r) => sel.routineIds.includes(r.id));
  }
  if (sel.learningIds?.length) {
    const { items } = await loadLearnings(deps.vfs, root);
    content.learnings = items.filter((l) => sel.learningIds.includes(l.id));
  }

  const bytes = packAgent(
    content,
    { agentName: ctx.agent.name, houstonVersion: HOUSTON_VERSION },
    new Date().toISOString(),
  );
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${ctx.agent.name}.houstonagent"`,
  });
  res.end(Buffer.from(bytes));
  return true;
}

export interface PortableAccountDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
}

/**
 * Account-level portable routes: POST /v1/portable/preview (zip bytes →
 * manifest + inventory) and POST /v1/portable/install (zip bytes + agentName →
 * a new agent with the selected content written in). Returns true when handled.
 */
export async function handlePortableAccount(
  deps: PortableAccountDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (
    method !== "POST" ||
    (path !== "/v1/portable/preview" && path !== "/v1/portable/install")
  ) {
    return false;
  }
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const paths = deps.paths ?? new CloudPaths();

  // Install carries JSON ({ archive: base64, agentName }); preview is raw bytes.
  if (path === "/v1/portable/preview") {
    let pkg;
    try {
      pkg = unpackAgent(new Uint8Array(await readBytes(req)));
    } catch (err) {
      json(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
    json(res, 200, {
      manifest: pkg.manifest,
      inventory: portableInventory(pkg),
    });
    return true;
  }

  // install
  const body = await readJson(req);
  if (
    !body.agentName ||
    typeof body.agentName !== "string" ||
    typeof body.archive !== "string"
  ) {
    json(res, 400, { error: "missing 'agentName' or 'archive' (base64)" });
    return true;
  }
  let pkg;
  try {
    pkg = unpackAgent(new Uint8Array(Buffer.from(body.archive, "base64")));
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    return true;
  }

  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  const agent = await deps.store.createAgent({
    workspaceId: ws.id,
    name: body.agentName,
  });
  const root = paths.agentRoot(ws, agent);
  await seedSchemas(deps.vfs, root);

  if (pkg.claudeMd !== undefined)
    await deps.vfs.writeText(ctxFile(root), pkg.claudeMd);
  for (const s of pkg.skills)
    await deps.vfs.writeText(skillKey(root, s.slug), s.body);
  if (pkg.routines.length) await saveRoutines(deps.vfs, root, pkg.routines);
  if (pkg.learnings.length) await saveLearnings(deps.vfs, root, pkg.learnings);

  json(res, 201, { agent, installed: portableInventory(pkg) });
  return true;
}
