import type { IncomingMessage, ServerResponse } from "node:http";
import { actingAuthorFromHeader } from "../auth/acting";
import type { AgentId, WorkspaceId } from "../domain/types";
import { DEFAULT_PATHS } from "./agent-authz";
import { header, json } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { liveTurns } from "./live-turn";
import type { MissionsCtx, MissionsSandboxDeps } from "./missions-sandbox";
import { refusedOutsideExecuteTurn } from "./plan-gate";

export async function missionsContext(
  deps: MissionsSandboxDeps,
  claim: { workspaceId: WorkspaceId; agentId: AgentId },
  req: IncomingMessage,
  res: ServerResponse,
  duringTurn: boolean,
): Promise<MissionsCtx | null> {
  const vfs = deps.vfs;
  if (!vfs) {
    json(res, 503, {
      error: "agent data not configured",
      code: "agent_data_not_configured",
    });
    return null;
  }
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  const agent = await deps.store.getAgent(claim.agentId);
  if (!ws || !agent) {
    json(res, 404, { error: "agent not found" });
    return null;
  }
  const claimedConversationId = header(req, CONVERSATION_ID_HEADER);
  const turn = claimedConversationId
    ? liveTurns.get(claim.agentId, claimedConversationId)
    : undefined;
  if (
    duringTurn &&
    refusedOutsideExecuteTurn(claim.agentId, claimedConversationId, res)
  ) {
    return null;
  }
  const paths = deps.paths ?? DEFAULT_PATHS;
  return {
    deps,
    ws,
    agent,
    vfs,
    root: paths.agentRoot(ws, agent),
    paths,
    conversationId: turn?.conversationId,
    author: deps.gatewayFronted
      ? (actingAuthorFromHeader(turn?.actingAs) ?? undefined)
      : undefined,
    actingAs: deps.gatewayFronted ? turn?.actingAs : undefined,
    ...(deps.gatewayFronted && turn?.limits ? { limits: turn.limits } : {}),
  };
}
