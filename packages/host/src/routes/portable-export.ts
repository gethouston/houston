import type { IncomingMessage, ServerResponse } from "node:http";
import { applyOverrides, packAgent } from "@houston/domain";
import type {
  PortableExportOverrides,
  PortableSelection,
} from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json, readJson } from "./http";
import { gatherPortableContent } from "./portable-content";
import { defineRoute } from "./registry";

/** Bumped independently of the wire protocol; rides in the manifest. */
const HOUSTON_VERSION = "0.0.0";

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

/**
 * A wrong method falls through to the agent's runtime, as it does today — the
 * check above declines rather than refuses.
 */
defineRoute({
  group: "portable-export",
  method: "POST",
  path: "/agents/:agentId/portable/export",
  phase: "agent",
  classification: "sdk",
  methodMismatch: "fallthrough",
  source: "packages/host/src/routes/portable-export.ts",
  handler: async ({ deps, authz, method, path, req, res }) => {
    await handlePortableExport(
      { vfs: deps.vfs, paths: deps.paths ?? DEFAULT_PATHS },
      authz,
      method,
      agentRest(path),
      req,
      res,
    );
  },
});
