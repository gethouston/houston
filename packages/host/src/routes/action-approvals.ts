import type { IncomingMessage, ServerResponse } from "node:http";
import { canUseAgent } from "../domain/access";
import type { UserId } from "../domain/types";
import type { LocalActionApprovals } from "../integrations/action-approvals";
import type { WorkspaceStore } from "../ports";
import { json, readJson } from "./http";

/**
 * Per-agent integration action approvals — the ONE user route. When the user
 * confirms the approval card ("Do it"), the app POSTs the action slug here and
 * the host grants it for a short window (LocalActionApprovals.GRANT_TTL_MS), so
 * the re-issued execute — and any follow-up call of the same action (a batch, a
 * chained draft→send) — passes the sandbox gate (integrations-sandbox.ts)
 * without re-asking.
 *
 * TWO surfaces serve the SAME route (the skills-marketplace precedent): the
 * top-level `/v1/agents/:agentId/action-approvals/grants` for direct API
 * callers, and the per-agent dispatch `/agents/:agentId/action-approvals/grants`
 * — the ONE per-agent surface the hosted gateway proxies to a pod (it forwards
 * `/agents/{slug}/<rest>`), so the shipped clients call the dispatch form in
 * both deployments.
 *
 * Mounted only when `actionApprovals` is wired (see local/host.ts). Absent
 * dep → these handlers fall through, which the client reads as
 * "approvals unsupported" and degrades without a toast.
 *
 *   POST …/action-approvals/grants   {action} -> {ok:true}
 */
export interface ActionApprovalsDeps {
  store: WorkspaceStore;
  actionApprovals?: LocalActionApprovals;
}

/** Action slugs are `<TOOLKIT>_<REST>` (letters/digits/underscores); a hyphen is
 *  tolerated for parity with the grant slug charset. */
const ACTION = /^[A-Za-z0-9_-]+$/;

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

/** The surface-agnostic core: serve the `grants` POST for an agent the caller is
 *  ALREADY authorized on. Returns false when method+sub name no route in this
 *  family (the caller falls through). */
async function serve(
  approvals: LocalActionApprovals,
  agentId: string,
  method: string,
  sub: string | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (sub !== "grants" || method !== "POST") return false;
  const { action } = await readJson(req);
  if (typeof action !== "string" || !action || !ACTION.test(action)) {
    json(res, 400, { error: "missing or invalid 'action'" });
    return true;
  }
  await approvals.grant(agentId, action);
  json(res, 200, { ok: true });
  return true;
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
    /^\/v1\/agents\/([^/]+)\/action-approvals(?:\/(grants))?$/,
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
 * The SAME route on the per-agent dispatch surface
 * (`/agents/:agentId/action-approvals/grants`), matched on the dispatch `rest`
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
  const match = rest.match(/^action-approvals(?:\/(grants))?$/);
  if (!match || !approvals) return false;
  return serve(approvals, agentId, method, match[1], req, res);
}
