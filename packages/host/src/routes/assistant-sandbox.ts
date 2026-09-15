import type { IncomingMessage, ServerResponse } from "node:http";
import { assistantApprovals } from "../assistant/approvals";
import { processAssistantCatalog } from "../assistant/catalog-source";
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

/**
 * The RUNTIME-facing assistant surface (HMAC sandbox token) — what the agent's
 * `houston_call` tool proxies through:
 *
 *   POST /sandbox/assistant/pending  raise one approval card's request
 *   POST /sandbox/assistant/call     perform one catalogued operation
 *
 * WHY the host sits in the middle: the runtime is the least-trusted part of the
 * system, so it must never hold the credential that can act on a user's Houston
 * account, and it must never be the thing that decides an approval happened.
 * The runtime carries only its per-sandbox token; THIS route resolves the named
 * operation against the generated catalog (`assistant/catalog.ts`, fail-closed),
 * enforces the approval receipt for anything destructive (`assistant-operate.ts`
 * + `assistant/approvals.ts`), holds the gateway token, and relays the caller's
 * verified acting identity so the gateway authorizes the real person.
 *
 * Trust posture matches the other `/sandbox/*` proxies, plus one thing they do
 * not need: the decoded claim is SCOPED (`assistant-claim.ts`). Every agent on a
 * desktop holds a valid sandbox token, so authenticating one is not authorizing
 * it — only the personal assistant's own agent reaches these routes.
 */

export const ASSISTANT_CALL_PATH = "/sandbox/assistant/call";
export const ASSISTANT_PENDING_PATH = "/sandbox/assistant/pending";

export type { AssistantGateway } from "./assistant-forward";

/**
 * Both paths are owned for EVERY method: the wrong-method 405 carries a `code`
 * the runtime's tool classifies on, so this family answers it itself instead
 * of falling through to the bearer wall's 401.
 */
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

  // Authenticate the sandbox (NOT a user JWT) — same gate as /sandbox/missions —
  // and then AUTHORIZE it: these routes exist for the personal assistant alone.
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

  // A configured gateway with no catalog is a BROKEN BUILD, not an off one:
  // the catalog is embedded at build time, so the only way to reach here is a
  // build whose embedded document failed the envelope guard. 503, and the boot
  // log has already named it.
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
    gatewayAgentId: process.env.HOUSTON_AGENT_SLUG,
    conversationId: header(req, CONVERSATION_ID_HEADER),
    unserved: deps.unservedOperations?.() ?? new Set(),
    // Read lazily: only an operation that actually names an agent pays for the
    // listing, and both handlers resolve against the SAME set.
    agents: directory.agents,
    directory,
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
