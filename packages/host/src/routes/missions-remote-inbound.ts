import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityContributor } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import { DEFAULT_PATHS } from "./agent-authz";
import { json, readJson } from "./http";
import { applyMissionStatus } from "./missions-manage";
import { handleList, handleMissionRead } from "./missions-read";
import {
  parseMissionOrigin,
  parseMissionStart,
  parseMissionStatus,
} from "./missions-remote";
import type { MissionsCtx, MissionsDeps } from "./missions-sandbox";
import { startMission } from "./missions-start-run";

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
 * The move half: the same body a local move takes, applied to the agent in the
 * path. The guards live in {@link applyMissionStatus}, so a cross-pod move is
 * held to the identical rules as a local one — except the "never the mission
 * this conversation IS" one, which cannot fire here because the calling chat
 * lives in another pod entirely.
 */
async function statusInbound(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  // As with a start: this route serves the agent in its address, and a second
  // hop would let one move fan out.
  if (body.agent !== undefined) {
    return json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
  }
  const parsed = parseMissionStatus(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  await applyMissionStatus(ctx, parsed.value, res);
}

/** The start half: the same payload a local start parses, plus its origin. */
async function startInbound(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  // A caller naming a DIFFERENT agent has the wrong address: this route serves
  // the agent in its path, and a second hop would let one call fan out.
  if (body.agent !== undefined) {
    return json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
  }
  const parsed = parseMissionStart(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  const origin = parseMissionOrigin(body);
  if (!origin.ok)
    return json(res, origin.code === "mission_depth" ? 409 : 400, {
      error: origin.error,
      code: origin.code,
    });
  // The origin travels whole: the target records WHO asked and at what depth,
  // which is the only trace of either once the parent's pod is out of reach.
  await startMission(ctx, parsed.value, origin.value, res);
}
