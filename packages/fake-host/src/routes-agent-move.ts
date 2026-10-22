/**
 * `POST /v1/agents/:slug/move {to}` and its poll, the gateway's agent move
 * between orgs. The move lands at once: the agent is listed only in the
 * destination's space from then on, and every poll answers `done`. Like the
 * gateway it takes any source, a locked one included (moving agents out is
 * how a locked org empties), and refuses a destination that is locked
 * (`403 needs_upgrade`) or that the caller is not in.
 */

import { json } from "./http";
import * as state from "./state";

function knownOrg(slug: string): boolean {
  return (
    slug === state.PERSONAL_ORG_SLUG ||
    state.getTeamWorkspaces().some((row) => row.id === `org:${slug}`)
  );
}

/** Route an agent move, or `undefined` to fall through. */
export function handleAgentMoveRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (segs[0] !== "v1" || segs[1] !== "agents" || segs[3] !== "move")
    return undefined;
  const agentId = decodeURIComponent(segs[2] ?? "");
  const agent = state.state.agents.find((a) => a.id === agentId);
  if (!agent) return json({ error: "agent not found" }, 404);
  if (segs.length === 5 && method === "GET") return json({ status: "done" });
  if (segs.length !== 4 || method !== "POST") return undefined;
  const to = typeof body?.to === "string" ? body.to : "";
  if (!knownOrg(to))
    return json({ error: "not a member", code: "unsupported_move" }, 403);
  if (state.orgWritesLocked(to))
    return json(
      { error: "this organization is locked", code: "needs_upgrade" },
      403,
    );
  agent.orgSlug = to;
  state.emitDomain("AgentsChanged");
  return json({ moveId: `move-${agentId}-${to}` }, 202);
}
