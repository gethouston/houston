import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityContributor } from "@houston/protocol";
import { ACTING_AS_HEADER, actingAuthorFromHeader } from "../auth/acting";
import type { Agent, Workspace } from "../domain/types";
import { DEFAULT_PATHS, trustedActingAs } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json } from "./http";
import { trustedCallingAgent } from "./missions-calling-agent";
import { handleList, handleMissionRead } from "./missions-read";
import { startInbound, statusInbound } from "./missions-remote-writes";
import type { MissionsCtx, MissionsDeps } from "./missions-sandbox";
import { defineRouteFamily } from "./registry";

export interface MissionsDispatchCtx {
  workspace: Workspace;
  agent: Agent;
  author?: ActivityContributor;
  actingAs?: string;
  callingAgent?: string;
}

const MISSION_VERBS: Record<string, { method: string; op: MissionOp }> = {
  missions: { method: "GET", op: "list" },
  "missions/read": { method: "GET", op: "read" },
  "missions/start": { method: "POST", op: "start" },
  "missions/status": { method: "POST", op: "status" },
};

type MissionOp = "list" | "read" | "start" | "status";

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
  const ctx: MissionsCtx & { callingAgent?: string } = {
    deps,
    ws: target.workspace,
    agent: target.agent,
    vfs: deps.vfs,
    root: paths.agentRoot(target.workspace, target.agent),
    paths,
    ...(target.author ? { author: target.author } : {}),
    ...(target.actingAs ? { actingAs: target.actingAs } : {}),
    ...(target.callingAgent ? { callingAgent: target.callingAgent } : {}),
  };

  if (verb.op === "list") await handleList(ctx, url, res);
  else if (verb.op === "read") await handleMissionRead(ctx, url, res);
  else if (verb.op === "start") await startInbound(ctx, req, res);
  else await statusInbound(ctx, req, res);
  return true;
}

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
    const author = deps.gatewayFronted
      ? actingAuthorFromHeader(req.headers[ACTING_AS_HEADER])
      : null;
    const actingAs = trustedActingAs(deps, req);
    const callingAgent = trustedCallingAgent(deps, req);
    return handleAgentMissions(
      deps,
      {
        workspace: authz.workspace,
        agent: authz.agent,
        ...(author ? { author } : {}),
        ...(actingAs ? { actingAs } : {}),
        ...(callingAgent ? { callingAgent } : {}),
      },
      method,
      agentRest(path),
      url,
      req,
      res,
    );
  },
});
