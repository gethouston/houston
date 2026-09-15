import type { IncomingMessage, ServerResponse } from "node:http";
import {
  loadSkillsManifest,
  normalizeSkillsManifest,
  saveSkillsManifest,
} from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json, methodNotAllowed, readJson } from "./http";
import { defineRouteFamily } from "./registry";

/** Per-agent shared-skill enablement, mounted behind the agent ownership check. */
export async function handleSkillsManifest(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  if (rest !== "skills-manifest") return false;
  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  if (method === "GET") {
    json(res, 200, await loadSkillsManifest(vfs, root));
    return true;
  }
  if (method === "PUT") {
    const manifest = normalizeSkillsManifest(await readJson(req));
    await saveSkillsManifest(vfs, root, manifest);
    emit?.({ type: "SkillsChanged", agentPath: ctx.agent.id });
    json(res, 200, manifest);
    return true;
  }
  methodNotAllowed(res);
  return true;
}

/**
 * One path, two verbs — and a wrong verb is answered by this handler, not by
 * the chain: the manifest 405s after the unwired-vfs 503, so the family
 * owns its own path for every method rather than letting the dispatcher
 * shortcut to a 405 the handler would never have reached.
 */
defineRouteFamily({
  group: "skills-manifest",
  members: [
    { method: "GET", path: "/agents/:agentId/skills-manifest" },
    { method: "PUT", path: "/agents/:agentId/skills-manifest" },
  ],
  owns: ["/agents/:agentId/skills-manifest"],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/skills-manifest.ts",
  handler: async ({ deps, authz, method, path, req, res, emit }) => {
    await handleSkillsManifest(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    );
  },
});
