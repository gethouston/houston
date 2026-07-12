/**
 * Per-agent integration action-approval USER routes for the fake host, mirroring
 * the real host `routes/action-approvals.ts` (mounted at `/v1/agents/:id/
 * action-approvals[...]`, authed as the signed-in owner in both deployments).
 * The interaction card's "Always allow" appends the action slug; "Allow once"
 * writes a one-shot ticket for the params-fingerprint hash. Shapes + validation
 * match the real route exactly.
 *
 *   GET  /v1/agents/:agentId/action-approvals          -> {always}
 *   POST /v1/agents/:agentId/action-approvals/always    {action} -> {always}
 *   POST /v1/agents/:agentId/action-approvals/tickets   {hash}   -> {ok:true}
 *
 * Returns a `Response` when a route matched, or `undefined` to fall through.
 */

import { json } from "./http";
import * as state from "./state";

/** Action slugs are letters/digits/underscores; a hyphen is tolerated for parity
 *  with the grant slug charset (real route's `ACTION`). */
const ACTION = /^[A-Za-z0-9_-]+$/;
/** A params fingerprint from hashActionParams: sha256 truncated to 16 hex chars. */
const HASH = /^[a-f0-9]{16}$/;

/** Route `/v1/agents/:agentId/action-approvals[...]`; `segs` is the full path
 *  split (not decoded). */
export function handleActionApprovals(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (
    segs[0] !== "v1" ||
    segs[1] !== "agents" ||
    segs.length < 4 ||
    segs.length > 5 ||
    segs[3] !== "action-approvals"
  ) {
    return undefined;
  }
  const agentId = decodeURIComponent(segs[2]);
  const sub = segs[4]; // undefined | "always" | "tickets"

  if (!sub && method === "GET") {
    return json({ always: state.alwaysAllowed(agentId) });
  }
  if (sub === "always" && method === "POST") {
    const action = typeof body?.action === "string" ? body.action : "";
    if (!action || !ACTION.test(action)) {
      return json({ error: "missing or invalid 'action'" }, 400);
    }
    return json({ always: state.allowAlways(agentId, action) });
  }
  if (sub === "tickets" && method === "POST") {
    const hash = typeof body?.hash === "string" ? body.hash : "";
    if (!hash || !HASH.test(hash)) {
      return json({ error: "missing or invalid 'hash'" }, 400);
    }
    state.addTicket(agentId, hash);
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}
