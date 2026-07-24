/**
 * Per-agent integration action-approval USER route for the fake host, mirroring
 * the real host `routes/action-approvals.ts` — BOTH surfaces: the top-level
 * `/v1/agents/:id/action-approvals/grants` and the per-agent dispatch
 * `/agents/:id/action-approvals/grants` (the one the shipped clients call, since
 * it is the only per-agent surface the hosted gateway proxies to a pod). The
 * interaction card's confirm ("Do it") grants the action slug. Shapes +
 * validation match the real route exactly.
 *
 *   POST …/action-approvals/grants   {action} -> {ok:true}
 *
 * Returns a `Response` when the route matched, or `undefined` to fall through.
 */

import { json } from "./http";
import * as state from "./state";

/** Action slugs are letters/digits/underscores; a hyphen is tolerated for parity
 *  with the real route's `ACTION`. */
const ACTION = /^[A-Za-z0-9_-]+$/;

/** Route `/v1/agents/:agentId/action-approvals/grants` AND the dispatch form
 *  `/agents/:agentId/action-approvals/grants`; `segs` is the full path split
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
    rel.length !== 4 ||
    rel[2] !== "action-approvals" ||
    rel[3] !== "grants"
  ) {
    return undefined;
  }
  const agentId = decodeURIComponent(rel[1]);

  if (method !== "POST") return json({ error: "not found" }, 404);
  const action = typeof body?.action === "string" ? body.action : "";
  if (!action || !ACTION.test(action)) {
    return json({ error: "missing or invalid 'action'" }, 400);
  }
  state.grant(agentId, action);
  return json({ ok: true });
}
