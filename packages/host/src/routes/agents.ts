import { channelFor, DEFAULT_PATHS, noChannel } from "./agent-authz";
import { PROXY_MEMBERS } from "./agents-proxy-members";
import { runTurnSeams, turnConversationOf } from "./agents-turn-seams";
import { defineProxyFamily } from "./registry";
import { turnBody } from "./turn-body";

// The deps bag + authz helpers live in agent-authz.ts (shared with
// routine-runs.ts); re-exported so existing importers keep working.
export type { AgentRouteDeps } from "./agent-authz";

/**
 * THE PER-AGENT RUNTIME SURFACE: `/agents/:agentId/<anything>` → the agent's
 * own engine, via the workspace's channel. The frontend points its runtime
 * client at `${controlPlaneUrl}/agents/${agentId}`, so chat turns, the SSE
 * event stream, and the provider connect flow all reach the engine under one
 * ownership check — run by the dispatcher, once, for this family and for every
 * host-served family declared ahead of it.
 *
 * Matching is `*rest`, so a rest nobody declared still reaches the engine and
 * gets the engine's own 404. The member list (agents-proxy-members.ts) is the
 * published surface, not the match.
 */
defineProxyFamily({
  group: "agent-proxy",
  path: "/agents/:agentId/*rest",
  phase: "agent",
  classification: "runtime-proxy",
  reason:
    "served by the agent's engine; the SDK reaches it through @houston/runtime-client",
  source: "packages/host/src/routes/agents.ts",
  members: PROXY_MEMBERS,
  async handler({
    deps,
    authz,
    actingAs,
    actingAuthor,
    emit,
    method,
    rest,
    url,
    req,
    res,
  }) {
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    const ctx = { workspace: authz.workspace, agent: authz.agent };
    const seams = {
      ...(deps.vfs ? { vfs: deps.vfs } : {}),
      paths: deps.paths ?? DEFAULT_PATHS,
      agent: authz.agent,
      workspace: authz.workspace,
      method,
      rest,
      ...(emit ? { emit } : {}),
      actingAuthor,
      ...(actingAs ? { actingAs } : {}),
      turnConversationId: turnConversationOf(method, rest),
      body: turnBody(req),
      client: res,
    };
    await runTurnSeams(seams);
    const body = seams.body.peek();
    await channel.dispatch(
      body ? { ...ctx, body } : ctx,
      method,
      rest,
      url,
      req,
      seams.client,
    );
  },
});
