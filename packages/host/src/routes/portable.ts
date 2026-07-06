import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyOverrides,
  filterPackage,
  type PortablePackage,
  packAgent,
  packageSeed,
  portableInventory,
  seedSchemas,
  unpackAgent,
} from "@houston/domain";
import type {
  PortableExportOverrides,
  PortableSelection,
} from "@houston/protocol";
import type { Agent, UserId, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { writeAgentSeeds } from "./agent-seed";
import { json, readJson } from "./http";
import { gatherPortableContent } from "./portable-content";

/** Bumped independently of the wire protocol; rides in the manifest. */
const HOUSTON_VERSION = "0.0.0";

async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Export an agent as a `.houstonagent` (agent-scoped: POST
 * .../portable/export). The body is either a bare PortableSelection (the
 * original contract) or `{ selection, overrides?, meta? }` — `overrides`
 * carries the anonymize diffs the user accepted, `meta.anonymized` stamps
 * the manifest. Gathers the selected content off the vfs and returns the
 * zip. Returns true when handled.
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
  // Untrusted wizard input; the reads below stay defensive.
  const body = await readJson(req);
  const wrapped = body.selection !== undefined;
  const sel = (wrapped ? body.selection : body) as PortableSelection;
  const overrides = wrapped
    ? (body.overrides as PortableExportOverrides | undefined)
    : undefined;
  const anonymized = wrapped
    ? Boolean((body.meta as { anonymized?: boolean } | undefined)?.anonymized)
    : false;

  const content = applyOverrides(
    await gatherPortableContent(deps.vfs, root, sel),
    overrides,
  );

  const bytes = packAgent(
    content,
    { agentName: ctx.agent.name, houstonVersion: HOUSTON_VERSION, anonymized },
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
    let pkg: PortablePackage;
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
  let pkg: PortablePackage;
  try {
    pkg = unpackAgent(new Uint8Array(Buffer.from(body.archive, "base64")));
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    return true;
  }
  // Optional install-time subset: the importer unticked items in the wizard.
  // Absent selection installs the whole package (the original contract).
  if (body.selection !== undefined) {
    pkg = filterPackage(pkg, body.selection as PortableSelection);
  }

  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  const agent = await deps.store.createAgent({
    workspaceId: ws.id,
    name: body.agentName,
  });
  const root = paths.agentRoot(ws, agent);
  await seedSchemas(deps.vfs, root);
  // The SAME serialization the browser adapter sends through create-with-seeds
  // on hosted cloud — one layout, wherever the install lands.
  await writeAgentSeeds(deps.vfs, root, packageSeed(pkg));

  json(res, 201, { agent, installed: portableInventory(pkg) });
  return true;
}
