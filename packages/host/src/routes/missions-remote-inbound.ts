import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityContributor } from "@houston/protocol";
import { ACTING_AS_HEADER, actingAuthorFromHeader } from "../auth/acting";
import type { Agent, Workspace } from "../domain/types";
import { DEFAULT_PATHS, trustedActingAs } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json } from "./http";
import { handleList, handleMissionRead } from "./missions-read";
import { startInbound, statusInbound } from "./missions-remote-writes";
import type { MissionsCtx, MissionsDeps } from "./missions-sandbox";
import { defineRouteFamily } from "./registry";

/**
 * The mission family on the PER-AGENT surface — `/agents/{id}/missions…`,
 * served for one agent to the caller already authorized for it:
 *
 *   POST /agents/{id}/missions/start   start a mission on this agent's board
 *   GET  /agents/{id}/missions         this agent's board
 *   GET  /agents/{id}/missions/read    one mission's transcript
 *   POST /agents/{id}/missions/status  move a mission on this agent's board
 *
 * WHY it exists: in managed cloud each agent is its own pod, so the personal
 * assistant's `start_mission` cannot reach another agent's board by writing a
 * file — it addresses the gateway, which dispatches here
 * (missions-remote-forward.ts is the other end). Everything a local start does
 * happens on THIS side: the running cap, the row, the reactivity event, the
 * first turn, and the rollback when the turn will not start.
 *
 * The caller is a user (or their assistant acting as them) that the gateway
 * already authorized for this agent, so this route grants no reach of its own.
 * What it must not take on trust is provenance: `origin` is required and its
 * depth is checked here, which is what keeps the board flat when the parent
 * chat lives in a pod this one cannot read.
 */

export interface MissionsDispatchCtx {
  workspace: Workspace;
  agent: Agent;
  /** The verified acting human (gateway-fronted only), for attribution. */
  author?: ActivityContributor;
  /** The raw gateway-minted acting-as token, for credential reads. */
  actingAs?: string;
}

/** The three calls this family serves, and the one verb each answers to. */
const MISSION_VERBS: Record<string, { method: string; op: MissionOp }> = {
  missions: { method: "GET", op: "list" },
  "missions/read": { method: "GET", op: "read" },
  "missions/start": { method: "POST", op: "start" },
  "missions/status": { method: "POST", op: "status" },
};

type MissionOp = "list" | "read" | "start" | "status";

/** Serve one `/agents/{id}/missions…` call, or answer false to fall through. */
export async function handleAgentMissions(
  deps: MissionsDeps,
  target: MissionsDispatchCtx,
  method: string,
  rest: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const verb = MISSION_VERBS[rest];
  if (!verb) {
    // A path this family does not serve still belongs to it: falling through
    // would send `missions/anything` to the agent's runtime, which has no
    // mission routes and would answer for something else entirely.
    if (rest !== "missions" && !rest.startsWith("missions/")) return false;
    json(res, 404, { error: "not found", code: "not_found" });
    return true;
  }
  if (method !== verb.method) {
    json(res, 405, { error: "method not allowed", code: "method_not_allowed" });
    return true;
  }
  if (
    (verb.op === "list" || verb.op === "read") &&
    url.searchParams.has("agent")
  ) {
    json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
    return true;
  }
  if (!deps.vfs) {
    json(res, 503, {
      error: "agent data not configured",
      code: "agent_data_not_configured",
    });
    return true;
  }
  const paths = deps.paths ?? DEFAULT_PATHS;
  const ctx: MissionsCtx = {
    deps,
    ws: target.workspace,
    agent: target.agent,
    vfs: deps.vfs,
    root: paths.agentRoot(target.workspace, target.agent),
    paths,
    ...(target.author ? { author: target.author } : {}),
    ...(target.actingAs ? { actingAs: target.actingAs } : {}),
  };

  if (verb.op === "list") await handleList(ctx, url, res);
  else if (verb.op === "read") await handleMissionRead(ctx, url, res);
  else if (verb.op === "start") await startInbound(ctx, req, res);
  else await statusInbound(ctx, req, res);
  return true;
}

/**
 * The family owns every path under `missions`, not just the four it serves:
 * falling through would send `missions/anything` to the agent's runtime, which
 * has no mission routes. Its 404 and its 405 both carry a `code` the
 * dispatcher's own refusal does not, so the handler answers them itself.
 */
defineRouteFamily({
  group: "agent-missions",
  members: [
    { method: "GET", path: "/agents/:agentId/missions" },
    { method: "GET", path: "/agents/:agentId/missions/read" },
    { method: "POST", path: "/agents/:agentId/missions/start" },
    { method: "POST", path: "/agents/:agentId/missions/status" },
  ],
  owns: [
    "/agents/:agentId/missions",
    "/agents/:agentId/missions/",
    "/agents/:agentId/missions/*rest",
  ],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/missions-remote-inbound.ts",
  handler: async ({ deps, authz, method, path, url, req, res }) => {
    // The acting human as a full contributor, stamped onto the mission. Null
    // off the gateway (desktop / self-host), where an inbound acting header is
    // untrusted client input — single-player activity.json gains no
    // attribution keys and stays byte-identical.
    const author = deps.gatewayFronted
      ? actingAuthorFromHeader(req.headers[ACTING_AS_HEADER])
      : null;
    const actingAs = trustedActingAs(deps, req);
    // The handler's own answer, not a discarded one: its `false` is a decline,
    // and swallowing it would report "handled" for a response never written.
    return handleAgentMissions(
      deps,
      {
        workspace: authz.workspace,
        agent: authz.agent,
        ...(author ? { author } : {}),
        ...(actingAs ? { actingAs } : {}),
      },
      method,
      agentRest(path),
      url,
      req,
      res,
    );
  },
});
