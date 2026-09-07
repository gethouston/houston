import type { ServerResponse } from "node:http";
import type { AgentId, UserId } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import { json } from "./http";

/**
 * Discovery for the user's personal assistant: `GET /v1/assistant` answers
 * WHICH agent holds it and WHICH conversation to open.
 *
 * The assistant is not a new chat surface. It is a special HIDDEN AGENT
 * reached through the same per-agent session routes every other agent uses, so
 * the only thing a client cannot work out for itself is its address — and that
 * is all this route serves.
 *
 * Desktop / self-host: the agent is the synthetic dot-named `.assistant` in the
 * user's personal workspace, following the hidden setup runtime's precedent
 * (`routes/setup-runtime.ts`) — a dot name is list-hidden by construction
 * (`store/local.ts` lists only dot-less directories), and `validateAgentName`
 * refuses a leading dot, so no user action can create it, rename another agent
 * onto it, or make it show up in the sidebar. It gets no `.houston` seeding:
 * the assistant performs Houston operations for the user, it does not keep a
 * board of its own.
 *
 * Gateway-fronted (a managed cloud pod): the GATEWAY owns discovery — it alone
 * knows which pod holds this user's assistant, which a single pod cannot. 501
 * is the honest answer; a second, divergent implementation here would be worse
 * than none.
 */

export const ASSISTANT_PATH = "/v1/assistant";

/**
 * The conversation every assistant session runs in. One per user, stable
 * across app restarts, so "open my assistant" always resumes the same thread.
 */
export const ASSISTANT_CONVERSATION_ID = "assistant";

/** The synthetic agent's name inside the user's personal workspace. */
export const ASSISTANT_AGENT_NAME = ".assistant";

export interface AssistantDeps {
  store: WorkspaceStore;
  /**
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod). Discovery belongs to the gateway there.
   */
  gatewayFronted?: boolean;
  /**
   * Materialize a synthetic agent's directory, idempotently. Wired by the
   * local profile to `liveAgentDirFor`, whose dot-segment carve-out is exactly
   * what lets an agent with no create path have a home. Absent on a deployment
   * with no on-disk tree of its own — it cannot host the assistant and says so
   * rather than answering with an address that resolves to nothing.
   */
  ensureSyntheticAgentDir?: (agentId: AgentId) => void;
}

/** What discovery answers: the agent's address and the conversation to open. */
export interface AssistantHandle {
  agent: AgentId;
  conversation: string;
}

/** Returns true when the request was handled. */
export async function handleAssistant(
  deps: AssistantDeps,
  userId: UserId,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== ASSISTANT_PATH) return false;
  if (method !== "GET") {
    json(res, 405, { error: "method not allowed", code: "method_not_allowed" });
    return true;
  }
  if (deps.gatewayFronted) {
    json(res, 501, {
      error: "the gateway serves assistant discovery, not this engine",
      code: "assistant_gateway_only",
    });
    return true;
  }
  if (!deps.ensureSyntheticAgentDir) {
    json(res, 503, {
      error: "this host cannot hold an assistant: no agent tree is configured",
      code: "assistant_unavailable",
    });
    return true;
  }

  // Lazily created and idempotent: the personal workspace is auto-provisioned
  // on first touch and the directory create is a mkdir -p, so a retry after a
  // partially completed first call converges instead of failing.
  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  const agent: AgentId = `${ws.id}/${ASSISTANT_AGENT_NAME}`;
  deps.ensureSyntheticAgentDir(agent);
  const handle: AssistantHandle = {
    agent,
    conversation: ASSISTANT_CONVERSATION_ID,
  };
  json(res, 200, handle);
  return true;
}
