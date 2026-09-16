import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent, RepoSkill } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { listSkillsFromRepo } from "../skills/github";
import { installSkillsFromRepo } from "../skills/install";
import { SkillRemoteError } from "../skills/remote-error";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json, methodNotAllowed, readJson } from "./http";
import { defineRouteFamily } from "./registry";

/**
 * The GitHub-repo skill routes: list every SKILL.md a repo publishes, and
 * install the ones the user picked into the agent's `.agents/skills/<slug>/`
 * tree (the same folders pi loads). Listing touches no workspace, so it is
 * served both agent-scoped (what the engine adapter calls; the hosted gateway
 * proxies ONLY /agents/:slug/*, so this is the shape that works everywhere)
 * and top-level (routes/skills-repo-list.ts, for direct host API callers).
 */

export interface RemoteSkillsDeps {
  /** Injection point for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Typed errors answer `{error: {code, message, kind, details: {kind}}}` so
 *  both `HoustonEngineError` readings — `details.kind` and `error.kind` —
 *  surface the same taxonomy the Add Skills dialog matches on. */
export function failSkill(res: ServerResponse, err: unknown): void {
  if (err instanceof SkillRemoteError) {
    const code =
      err.httpStatus === 400
        ? "BAD_REQUEST"
        : err.httpStatus === 404
          ? "NOT_FOUND"
          : "UNAVAILABLE";
    json(res, err.httpStatus, {
      error: {
        code,
        message: err.message,
        kind: err.kind,
        details: { kind: err.kind },
      },
    });
    return;
  }
  json(res, 502, {
    error: err instanceof Error ? err.message : String(err),
  });
}

export async function repoListAction(
  req: IncomingMessage,
  res: ServerResponse,
  fetchImpl: typeof fetch,
): Promise<void> {
  const body = await readJson(req);
  if (typeof body.source !== "string") {
    json(res, 400, { error: "missing 'source'" });
    return;
  }
  try {
    const { skills } = await listSkillsFromRepo(fetchImpl, body.source);
    json(res, 200, skills);
  } catch (err) {
    failSkill(res, err);
  }
}

export async function handleSkillsRemote(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
  deps: RemoteSkillsDeps = {},
): Promise<boolean> {
  const m = rest.match(/^skills\/repo\/([a-z]+)$/);
  if (!m) return false;
  const action = m[1];
  if (method !== "POST") {
    methodNotAllowed(res);
    return true;
  }
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (action === "list") {
    await repoListAction(req, res, fetchImpl);
    return true;
  }
  if (action !== "install") {
    json(res, 404, { error: "not found" });
    return true;
  }

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const body = await readJson(req);
  if (typeof body.source !== "string" || !Array.isArray(body.skills)) {
    json(res, 400, { error: "missing 'source' or 'skills'" });
    return true;
  }
  try {
    const installed = await installSkillsFromRepo(
      fetchImpl,
      vfs,
      paths.agentRoot(ctx.workspace, ctx.agent),
      body.source,
      body.skills as RepoSkill[],
    );
    emit?.({ type: "SkillsChanged", agentPath: ctx.agent.id });
    json(res, 200, installed);
  } catch (err) {
    failSkill(res, err);
  }
  return true;
}

/**
 * The two GitHub-repo routes as one family, plus the BOUNDARY the regex above
 * owns beyond them: any action under `skills/repo`, claimed for every method so
 * the handler is the one thing deciding what belongs here. That is what keeps
 * its three answers reachable and distinct — a blanket 405 for a wrong method,
 * a 404 for a lower-case action nobody serves, and a DECLINE for anything
 * `[a-z]+` never matched (`skills/repo/List`, a percent-escaped slug), which
 * then reaches the agent's own engine.
 *
 * The `:action` boundary is deliberately WIDER than the regex; the handler's
 * own `return false` is what narrows it back, so the matcher needs no
 * character class it does not have.
 */
defineRouteFamily({
  group: "skills-remote",
  members: [
    { method: "POST", path: "/agents/:agentId/skills/repo/list" },
    { method: "POST", path: "/agents/:agentId/skills/repo/install" },
  ],
  owns: ["/agents/:agentId/skills/repo/:action"],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/skills-remote.ts",
  handler: ({ deps, authz, method, path, req, res, emit }) =>
    handleSkillsRemote(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    ),
});
