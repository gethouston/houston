import type { IncomingMessage, ServerResponse } from "node:http";
import { canUseAgent } from "../domain/access";
import type { UserId } from "../domain/types";
import type { LocalActionApprovals } from "../integrations/action-approvals";
import type { WorkspaceStore } from "../ports";
import { json, readJson } from "./http";

/**
 * Per-agent integration action approvals — the USER routes (`/v1/agents/
 * :agentId/action-approvals/*`, authed as the signed-in owner). The app writes
 * here after the runtime surfaces an approval step on the interaction card:
 * "Always allow" appends the action slug; "Allow once" writes a one-shot ticket
 * for the params-fingerprint hash. Then the model re-issues the same execute and
 * the sandbox gate (integrations-sandbox.ts) lets it through.
 *
 * Mounted only when `deps.actionApprovals` is wired (see local/host.ts). Absent
 * dep → this handler falls through to a 404, which the client reads as
 * "approvals unsupported" and degrades without a toast.
 *
 *   GET  /v1/agents/:agentId/action-approvals          -> {always}
 *   POST /v1/agents/:agentId/action-approvals/always    {action} -> {always}
 *   POST /v1/agents/:agentId/action-approvals/tickets   {hash}   -> {ok:true}
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
  const sub = match[2];

  const agentId = match[1] ? decodeURIComponent(match[1]) : "";
  const authz = await authorize(deps.store, userId, agentId);
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }

  if (!sub && method === "GET") {
    json(res, 200, { always: await deps.actionApprovals.always(agentId) });
    return true;
  }

  if (sub === "always" && method === "POST") {
    const { action } = await readJson(req);
    if (typeof action !== "string" || !action || !ACTION.test(action)) {
      json(res, 400, { error: "missing or invalid 'action'" });
      return true;
    }
    json(res, 200, {
      always: await deps.actionApprovals.allowAlways(agentId, action),
    });
    return true;
  }

  if (sub === "tickets" && method === "POST") {
    const { hash } = await readJson(req);
    if (typeof hash !== "string" || !hash || !HASH.test(hash)) {
      json(res, 400, { error: "missing or invalid 'hash'" });
      return true;
    }
    await deps.actionApprovals.addTicket(agentId, hash);
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}
