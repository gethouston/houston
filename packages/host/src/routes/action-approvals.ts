import type { IncomingMessage, ServerResponse } from "node:http";
import { canUseAgent } from "../domain/access";
import type { UserId } from "../domain/types";
import type { LocalActionApprovals } from "../integrations/action-approvals";
import type { WorkspaceStore } from "../ports";
import { json, readJson } from "./http";

/**
 * Per-agent integration action approvals — the USER routes. The app writes
 * here after the runtime surfaces an approval step on the interaction card:
 * "Always allow" appends the action slug; "Allow once" writes a one-shot ticket
 * for the params-fingerprint hash. Then the model re-issues the same execute and
 * the sandbox gate (integrations-sandbox.ts) lets it through.
 *
 * TWO surfaces serve the same three routes (the skills-marketplace precedent):
 * the top-level `/v1/agents/:agentId/action-approvals/*` for direct API callers,
 * and the per-agent dispatch `/agents/:agentId/action-approvals/*` — the ONE
 * per-agent surface the hosted gateway proxies to a pod (it forwards
 * `/agents/{slug}/<rest>` and mounts no `/v1/agents/*` route for approvals), so
 * the shipped clients call the dispatch form in both deployments.
 *
 * Mounted only when `actionApprovals` is wired (see local/host.ts). Absent
 * dep → these handlers fall through, which the client reads as
 * "approvals unsupported" and degrades without a toast.
 *
 *   GET  …/action-approvals          -> {always}
 *   POST …/action-approvals/always    {action} -> {always}
 *   POST …/action-approvals/tickets   {hash}   -> {ok:true}
 */
export interface ActionApprovalsDeps {
  store: WorkspaceStore;
  actionApprovals?: LocalActionApprovals;
}

/** Action slugs are `<TOOLKIT>_<REST>` (letters/digits/underscores); a hyphen is
 *  tolerated for parity with the grant slug charset. */
const ACTION = /^[A-Za-z0-9_-]+$/;
/** A params fingerprint from hashActionParams: sha256 truncated to 16 hex chars. */
const HASH = /^[a-f0-9]{16}$/;

/** Ownership check mirroring the other agent routes (personal tier = owner-only). */
async function authorize(
  store: WorkspaceStore,
  userId: UserId,
  agentId: string,
): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  const agent = await store.getAgent(agentId);
  const workspace = agent ? await store.getWorkspace(agent.workspaceId) : null;
  const access = canUseAgent({ userId, agent, workspace });
  if (access.ok) return { ok: true };
  return {
    ok: false,
    status: access.reason === "agent not found" ? 404 : 403,
    reason: access.reason,
  };
}

/** The surface-agnostic core: serve one action-approvals request for an agent
 *  the caller is ALREADY authorized on. `sub` is undefined (the always-set
 *  read), "always", or "tickets". Returns false when method+sub name no route
 *  in this family (the caller falls through). */
async function serve(
  approvals: LocalActionApprovals,
  agentId: string,
  method: string,
  sub: string | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (!sub && method === "GET") {
    json(res, 200, { always: await approvals.always(agentId) });
    return true;
  }

  if (sub === "always" && method === "POST") {
    const { action } = await readJson(req);
    if (typeof action !== "string" || !action || !ACTION.test(action)) {
      json(res, 400, { error: "missing or invalid 'action'" });
      return true;
    }
    json(res, 200, { always: await approvals.allowAlways(agentId, action) });
    return true;
  }

  if (sub === "tickets" && method === "POST") {
    const { hash } = await readJson(req);
    if (typeof hash !== "string" || !hash || !HASH.test(hash)) {
      json(res, 400, { error: "missing or invalid 'hash'" });
      return true;
    }
    await approvals.addTicket(agentId, hash);
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}

export async function handleActionApprovals(
  deps: ActionApprovalsDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(
    /^\/v1\/agents\/([^/]+)\/action-approvals(?:\/(always|tickets))?$/,
  );
  if (!match) return false;
  // Not wired → fall through to a 404 so the client degrades to "unsupported".
  if (!deps.actionApprovals) return false;

  const agentId = match[1] ? decodeURIComponent(match[1]) : "";
  const authz = await authorize(deps.store, userId, agentId);
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }

  return serve(deps.actionApprovals, agentId, method, match[2], req, res);
}

/**
 * The SAME three routes on the per-agent dispatch surface
 * (`/agents/:agentId/action-approvals[...]`), matched on the dispatch `rest`
 * inside handleAgents — which has ALREADY run the ownership check, so no authz
 * here. This is the surface the hosted gateway proxies (scope: use), and the
 * one the shipped clients call in both deployments. Unwired approvals → false,
 * and the request falls through toward the runtime channel like any unknown
 * dispatch family.
 */
export async function handleActionApprovalsDispatch(
  approvals: LocalActionApprovals | undefined,
  agentId: string,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = rest.match(/^action-approvals(?:\/(always|tickets))?$/);
  if (!match || !approvals) return false;
  return serve(approvals, agentId, method, match[1], req, res);
}
