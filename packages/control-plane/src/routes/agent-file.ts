import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { Vfs } from "../vfs";
import type { WorkspacePaths } from "../paths";
import { json, readJson } from "./http";

/**
 * Raw `.houston/**` file read/write — the host side of the app's files-first
 * data layer (`readAgentJson`/`writeAgentJson` → readAgentFile/writeAgentFile).
 * The desktop UI reads activity/config/learnings as whole JSON docs this way,
 * NOT through the typed CRUD routes, so this is what actually backs the board.
 * Served off the agent's workspace vfs, so the host and the agent's runtime
 * (shared storage locally / cloud) see one file. Returns true when handled.
 */

/** The reactivity event a write under a known `.houston` family should fire. */
function eventForPath(rel: string, agentPath: string): HoustonEvent | null {
  if (rel.startsWith(".houston/routine_runs"))
    return { type: "RoutineRunsChanged", agentPath };
  if (rel.startsWith(".houston/routines"))
    return { type: "RoutinesChanged", agentPath };
  if (rel.startsWith(".houston/activity"))
    return { type: "ActivityChanged", agentPath };
  if (rel.startsWith(".houston/config"))
    return { type: "ConfigChanged", agentPath };
  if (rel.startsWith(".houston/learnings"))
    return { type: "LearningsChanged", agentPath };
  return { type: "FilesChanged", agentPath };
}

export async function handleAgentFile(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  const m = rest.match(/^agentfile\/(.+)$/);
  if (!m) return false;
  const captured = m[1];
  if (captured === undefined) return false;
  const rel = decodeURIComponent(captured);

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  // Clamp: a relative path inside the agent root, never an escape.
  if (
    rel.startsWith("/") ||
    rel.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    json(res, 400, { error: "invalid path" });
    return true;
  }
  const key = `${paths.agentRoot(ctx.workspace, ctx.agent)}/${rel}`;

  if (method === "GET") {
    // Empty (not 404) for a missing file: the app's readAgentJson treats falsy
    // content as "use the fallback", which is the desired first-run behavior.
    json(res, 200, { content: (await vfs.readText(key)) ?? "" });
    return true;
  }
  if (method === "PUT" || method === "POST") {
    const body = await readJson(req);
    if (typeof body.content !== "string") {
      json(res, 400, { error: "missing 'content'" });
      return true;
    }
    await vfs.writeText(key, body.content);
    const event = eventForPath(rel, ctx.agent.id);
    if (event) emit?.(event);
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 405, { error: "method not allowed" });
  return true;
}
