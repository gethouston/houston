import type { IncomingMessage, ServerResponse } from "node:http";
import { agentFileEventType } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { FilePathError, safeRel } from "../turn/files-path";
import type { Vfs } from "../vfs";
import { hostOwnedApprovalCards } from "./activity-approval-cards";
import { json, readJson } from "./http";

/**
 * Raw `.houston/**` file read/write — the host side of the app's files-first
 * data layer (`readAgentJson`/`writeAgentJson` → readAgentFile/writeAgentFile).
 * The desktop UI reads activity/config/learnings as whole JSON docs this way,
 * NOT through the typed CRUD routes, so this is what actually backs the board.
 * Served off the agent's workspace vfs, so the host and the agent's runtime
 * (shared storage locally / cloud) see one file. Returns true when handled.
 */

/** The board document, the one file served here that can carry an approval card. */
const ACTIVITY_DOCUMENT = ".houston/activity/activity.json";

/**
 * The internal documents this route serves, listed because the alternative is
 * serving the agent's whole state directory.
 *
 * On the LOCAL layout the runtime's data directory lives INSIDE the agent root
 * (`paths.ts`: `<Workspace>/<Agent>/.houston/runtime`), so a route that clamped
 * traversal alone handed out `auth.json` (the OAuth access + refresh tokens),
 * the served-providers manifest, `settings.json` and every stored transcript to
 * anything that could address it — the Files tab's own rule (no top-level
 * dot-directory, `turn/files-path.ts`) exists for exactly this reason.
 *
 * So the visible working tree is admitted by that same rule, and the documents
 * the app genuinely keeps under dot-directories are named one by one: the
 * families the board, settings and memory panes read/write, plus the skill
 * files the skills panes save. Everything else under a dot-directory answers
 * 403 — including anything added to `.houston/runtime` later, which is the
 * point of listing what is allowed rather than what is not.
 */
const INTERNAL_DOCUMENT_PREFIXES: readonly string[] = [
  ".houston/activity/",
  ".houston/config/",
  ".houston/learnings/",
  ".houston/routines/",
  ".houston/routine_runs/",
  ".houston/skills/",
  ".agents/skills/",
  ".claude/skills/",
];

/**
 * True when `rel` is a document this route serves: an ordinary file in the
 * agent's visible working tree (the Files tab's own predicate, reused rather
 * than restated) or one of the named internal documents above.
 */
function isServedDocument(rel: string): boolean {
  try {
    safeRel(rel);
    return true;
  } catch (error) {
    if (!(error instanceof FilePathError)) throw error;
    return INTERNAL_DOCUMENT_PREFIXES.some((prefix) => rel.startsWith(prefix));
  }
}

/**
 * The reactivity event a write to `rel` should fire, or null for paths not
 * worth an event. Classification comes from the ONE shared domain classifier
 * (`agentFileEventType`), so this route, the FS watcher, and the web adapter's
 * write-through echo can never drift into disagreeing about which file raises
 * which event — e.g. a PUT of `CLAUDE.md` must fire `ContextChanged`, not
 * `FilesChanged` (HOU-644).
 */
function eventForPath(rel: string, agentPath: string): HoustonEvent | null {
  const type = agentFileEventType(rel);
  if (type === null) return null;
  return { type, agentPath };
}

/**
 * The board as the HOST tells it: an approval card stored on a mission row is
 * re-rendered from the host's own record and a card with no live record loses
 * its receipt (`activity-approval-cards.ts`). The board is read through THIS
 * route (`app/src/data/activity.ts`), not the typed activities route, so the
 * substitution has to happen here or the person would be clicking approve on
 * whatever prose the agent wrote into the file with its own tools.
 *
 * A document that is not JSON carries no card and is served unchanged.
 */
function servedContent(rel: string, content: string, agentId: string): string {
  if (rel !== ACTIVITY_DOCUMENT || content === "") return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  return JSON.stringify(hostOwnedApprovalCards(parsed, agentId));
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
  if (!isServedDocument(rel)) {
    json(res, 403, {
      error: "that is not one of the agent's documents",
      code: "path_not_allowed",
    });
    return true;
  }
  const key = `${paths.agentRoot(ctx.workspace, ctx.agent)}/${rel}`;

  if (method === "GET") {
    // Empty (not 404) for a missing file: the app's readAgentJson treats falsy
    // content as "use the fallback", which is the desired first-run behavior.
    const content = (await vfs.readText(key)) ?? "";
    json(res, 200, { content: servedContent(rel, content, ctx.agent.id) });
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
