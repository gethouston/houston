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
import { json, readJson } from "./http";

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
  json(res, 405, { error: "method not allowed" });
  return true;
}
