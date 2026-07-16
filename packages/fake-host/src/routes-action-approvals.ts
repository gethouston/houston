/**
 * Per-agent integration action-approval USER routes for the fake host, mirroring
 * the real host `routes/action-approvals.ts` — BOTH surfaces: the top-level
 * `/v1/agents/:id/action-approvals[...]` and the per-agent dispatch
 * `/agents/:id/action-approvals[...]` (the one the shipped clients call, since
 * it is the only per-agent surface the hosted gateway proxies to a pod).
 * The interaction card's "Always allow" appends the action slug; "Allow once"
 * writes a one-shot ticket for the params-fingerprint hash. Shapes + validation
 * match the real route exactly.
 *
 *   GET  …/action-approvals          -> {always}
 *   POST …/action-approvals/always    {action} -> {always}
 *   POST …/action-approvals/tickets   {hash}   -> {ok:true}
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

/** Route `/v1/agents/:agentId/action-approvals[...]` AND the dispatch form
 *  `/agents/:agentId/action-approvals[...]`; `segs` is the full path split
 *  (not decoded). */
export function handleActionApprovals(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  // Normalize the two surfaces to one shape: drop the optional leading "v1".
  const rel = segs[0] === "v1" ? segs.slice(1) : segs;
  if (
    rel[0] !== "agents" ||
    rel.length < 3 ||
    rel.length > 4 ||
    rel[2] !== "action-approvals"
  ) {
    return undefined;
  }
  const agentId = decodeURIComponent(rel[1]);
  const sub = rel[3]; // undefined | "always" | "tickets"

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
