import type { IncomingMessage, ServerResponse } from "node:http";
import { actingAuthorFromHeader } from "../auth/acting";
import type { AgentId, WorkspaceId } from "../domain/types";
import { DEFAULT_PATHS } from "./agent-authz";
import { header, json } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { liveTurns } from "./live-turn";
import type { MissionsCtx, MissionsSandboxDeps } from "./missions-sandbox";
import { refusedOutsideExecuteTurn } from "./plan-gate";

/**
 * Resolve one authenticated sandbox call into the context every mission
 * handler reads, or answer the refusal it earns (`null`). The refusals are
 * ordered as the deployment's own facts first — no agent data configured, no
 * such agent — and the caller's standing last.
 */
export async function missionsContext(
  deps: MissionsSandboxDeps,
  claim: { workspaceId: WorkspaceId; agentId: AgentId },
  req: IncomingMessage,
  res: ServerResponse,
  /** True for the commands that WRITE, which only a running execute turn may. */
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
  // WHICH CHAT THIS CALL IS SPEAKING IN. The runtime NAMES the conversation
  // (`x-houston-conversation-id`) and the host MATCHES it against its own record
  // of the turn it started there (routes/live-turn.ts): every mission decision
  // that reads it is a decision ABOUT the caller - which mission it may not move
  // (it is the one it is talking in), how deep its next start sits, whose name
  // the work is done in - so a runtime that could source a conversation would be
  // answering its own guards. No record means no turn of the host's is running
  // there, and the write is refused rather than attributed to a chat nobody is in.
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
    // WHO the turn acts as, as the host recorded it when the turn began. A
    // loopback /sandbox call is not gateway-fronted, so the acting-as header on
    // THIS request is the runtime's own word about whose name the mission is
    // created in; the header the gateway stamped on the user's send is not.
    author: deps.gatewayFronted
      ? (actingAuthorFromHeader(turn?.actingAs) ?? undefined)
      : undefined,
    actingAs: deps.gatewayFronted ? turn?.actingAs : undefined,
  };
}
