import type { IncomingMessage, ServerResponse } from "node:http";
import { anonymizeContent } from "@houston/domain";
import type { PortableAnonymizeRequest } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";
import { gatherPortableContent } from "./portable-content";

/**
 * POST .../portable/anonymize — the export wizard's "Help me anonymize"
 * pass. Gathers the selected content off the vfs, runs the heuristic
 * redactor (`@houston/domain`), and returns the side-by-side diffs the
 * wizard renders. Read-only: nothing on the agent changes; the accepted
 * diffs come back as `overrides` on the export call. Returns true when
 * handled.
 */
export async function handlePortableAnonymize(
  deps: { vfs?: Vfs; paths?: WorkspacePaths },
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (rest !== "portable/anonymize" || method !== "POST") return false;
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const paths = deps.paths ?? new CloudPaths();
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  // Untrusted wizard input — normalize before reuse as a selection.
  const body = (await readJson(req)) as unknown as PortableAnonymizeRequest;
  const content = await gatherPortableContent(deps.vfs, root, {
    includeClaudeMd: Boolean(body.claudeMd),
    skillSlugs: Array.isArray(body.skillSlugs) ? body.skillSlugs : [],
    routineIds: Array.isArray(body.routineIds) ? body.routineIds : [],
    learningIds: Array.isArray(body.learningIds) ? body.learningIds : [],
  });
  json(res, 200, anonymizeContent(content));
  return true;
}
