import type { ServerResponse } from "node:http";
import type { AgentId, UserId } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import { json } from "./http";
import { defineRouteFamily } from "./registry";

export const ASSISTANT_PATH = "/v1/assistant";

export const ASSISTANT_CONVERSATION_ID = "assistant";

export const ASSISTANT_AGENT_NAME = ".assistant";

export interface AssistantDeps {
  store: WorkspaceStore;
  gatewayFronted?: boolean;
  ensureSyntheticAgentDir?: (agentId: AgentId) => void;
}

export interface AssistantHandle {
  agent: AgentId;
  conversation: string;
}

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
    json(res, 501, {
      error: "this host cannot hold an assistant: no agent tree is configured",
      code: "assistant_unavailable",
    });
    return true;
  }

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

defineRouteFamily({
  group: "assistant",
  members: [{ method: "GET", path: ASSISTANT_PATH }],
  owns: [ASSISTANT_PATH],
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/assistant.ts",
  handler: async ({ deps, userId, method, res }) => {
    await handleAssistant(deps, userId, method, ASSISTANT_PATH, res);
  },
});
