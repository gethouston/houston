import type { IncomingMessage, ServerResponse } from "node:http";
import { assistantApprovals } from "../assistant/approvals";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { gatewayAgentSlug } from "../assistant/coordinator-scope";
import { ACTING_AS_HEADER } from "../auth/acting";
import { assistantClaim } from "./assistant-claim";
import {
  handleAssistantCall,
  handleAssistantPending,
} from "./assistant-operate";
import {
  type AssistantOperationCtx,
  assistantOperationDirectory,
} from "./assistant-operation-ctx";
import type { AssistantSandboxDeps } from "./assistant-sandbox-deps";
import { resolveAssistantGateway } from "./assistant-wiring";
import { bearer, header, json, readJson } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { defineRouteFamily } from "./registry";

export const ASSISTANT_CALL_PATH = "/sandbox/assistant/call";
export const ASSISTANT_PENDING_PATH = "/sandbox/assistant/pending";

export type { AssistantGateway } from "./assistant-forward";

defineRouteFamily({
  group: "sandbox-assistant",
  members: [
    { method: "POST", path: ASSISTANT_CALL_PATH },
    { method: "POST", path: ASSISTANT_PENDING_PATH },
  ],
  owns: [ASSISTANT_CALL_PATH, ASSISTANT_PENDING_PATH],
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The agent's houston_call tool proxies through here on a per-sandbox HMAC token scoped to the personal assistant.",
  source: "packages/host/src/routes/assistant-sandbox.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxAssistant(deps, method, path, url, req, res),
});

export async function handleSandboxAssistant(
  deps: AssistantSandboxDeps,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const isCall = path === ASSISTANT_CALL_PATH;
  if (!isCall && path !== ASSISTANT_PENDING_PATH) return false;
  if (method !== "POST") {
    json(res, 405, { error: "method not allowed", code: "method_not_allowed" });
    return true;
  }

  const claim = assistantClaim(deps.vault, bearer(req, url), {
    gatewayFronted: deps.gatewayFronted,
  });
  if (!claim) {
    json(res, 401, { error: "unauthorized", code: "unauthorized" });
    return true;
  }

  const gateway = (deps.assistantGateway ?? resolveAssistantGateway)();
  if (!gateway) {
    json(res, 501, {
      error:
        "this host performs no Houston operations: set HOUSTON_ASSISTANT_CP_URL and HOUSTON_ASSISTANT_TOKEN",
      code: "assistant_not_configured",
    });
    return true;
  }

  const catalog = (deps.assistantCatalog ?? processAssistantCatalog)();
  if (!catalog) {
    console.error(
      "[assistant] the embedded operation catalog is unreadable: this host can perform nothing",
    );
    json(res, 503, {
      error:
        "this build carries no readable Houston operation catalog: regenerate it with `pnpm gen:assistant-catalog` and rebuild",
      code: "assistant_catalog_unavailable",
    });
    return true;
  }

  const payload = await readJson(req);
  const operation =
    typeof payload.operation === "string" ? payload.operation : "";
  const params = (payload.params ?? {}) as Record<string, unknown>;
  const directory = assistantOperationDirectory(
    deps,
    claim,
    gateway,
    header(req, ACTING_AS_HEADER),
  );
  const ctx: AssistantOperationCtx = {
    catalog,
    approvals: deps.approvals ?? assistantApprovals,
    agentId: claim.agentId,
    gatewayFronted: deps.gatewayFronted,
    gatewayAgentId: gatewayAgentSlug(),
    conversationId: header(req, CONVERSATION_ID_HEADER),
    unserved: deps.unservedOperations?.() ?? new Set(),
    agents: directory.agents,
    directory,
    ...(deps.persistApprovals
      ? { persistApprovals: deps.persistApprovals }
      : {}),
  };

  if (!isCall) {
    await handleAssistantPending(ctx, operation, params, res);
    return true;
  }
  await handleAssistantCall(
    ctx,
    {
      operation,
      params,
      requestId:
        typeof payload.requestId === "string" ? payload.requestId : undefined,
      actingAs: header(req, ACTING_AS_HEADER),
      gateway,
      fetchImpl: deps.fetchImpl ?? fetch,
    },
    res,
  );
  return true;
}
