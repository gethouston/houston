import type { IncomingMessage, ServerResponse } from "node:http";
import { type ApprovalStore, assistantApprovals } from "../assistant/approvals";
import type { AssistantCatalog } from "../assistant/catalog";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { ACTING_AS_HEADER } from "../auth/acting";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { assistantClaim } from "./assistant-claim";
import type { AssistantGateway } from "./assistant-forward";
import {
  handleAssistantCall,
  handleAssistantPending,
} from "./assistant-operate";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { resolveAssistantGateway } from "./assistant-wiring";
import { bearer, header, json, readJson } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { reachableAgentsForWorkspace } from "./reachable-agents";

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

export interface AssistantSandboxDeps {
  vault: CredentialVault;
  /**
   * The agents an operation's parameters may name. Identifiers are never
   * guessed: a reference the caller wrote ("Dobby", "Personal/Dobby", an id) is
   * resolved against what actually exists for the sandbox's own workspace
   * before any request is built (`assistant/entity-resolution.ts`).
   */
  store: WorkspaceStore;
  /** Injection point for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Where operations are performed. `local/host.ts` sets it from the ONE
   * resolver (`assistant-wiring.ts`), which is also what the default below
   * calls — a server built without this seam still reads the configured env
   * pair, and nothing else.
   */
  assistantGateway?: () => AssistantGateway | null;
  /** Injection point for tests; production reads the embedded catalog once. */
  assistantCatalog?: () => AssistantCatalog | null;
  /**
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod), where one pod holds one agent — see `assistant-claim.ts`.
   */
  gatewayFronted?: boolean;
  /** Injection point for tests; production shares one per-process store. */
  approvals?: ApprovalStore;
}

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
  const ctx: AssistantOperationCtx = {
    catalog,
    approvals: deps.approvals ?? assistantApprovals,
    agentId: claim.agentId,
    conversationId: header(req, CONVERSATION_ID_HEADER),
    // Read lazily: only an operation that actually names an agent pays for the
    // listing, and both handlers resolve against the SAME set.
    agents: () => reachableAgentsForWorkspace(deps.store, claim.workspaceId),
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
