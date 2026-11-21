import { channelFor, DEFAULT_PATHS, noChannel } from "./agent-authz";
import { PROXY_MEMBERS } from "./agents-proxy-members";
import {
  runTurnSeams,
  type TurnMessageState,
  turnConversationOf,
} from "./agents-turn-seams";
import { json } from "./http";
import { defineProxyFamily } from "./registry";
import { turnBody } from "./turn-body";

export type { AgentRouteDeps } from "./agent-authz";

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
    userId,
    req,
    res,
  }) {
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    const ctx = { workspace: authz.workspace, agent: authz.agent };
    const message: TurnMessageState = { duplicate: false };
    const seams = {
      ...(deps.pushReports ? { pushReports: deps.pushReports } : {}),
      ...(deps.vfs ? { vfs: deps.vfs } : {}),
      paths: deps.paths ?? DEFAULT_PATHS,
      agent: authz.agent,
      workspace: authz.workspace,
      method,
      rest,
      ...(emit ? { emit } : {}),
      gatewayFronted: deps.gatewayFronted === true,
      actingAuthor,
      ...(actingAs ? { actingAs } : {}),
      actor: actingAuthor?.user_id ?? userId,
      turnConversationId: turnConversationOf(method, rest),
      body: turnBody(req),
      message,
      client: res,
    };
    await runTurnSeams(seams);
    if (message.refusal) {
      const { status, code } = message.refusal;
      return json(res, status, { error: code, code });
    }
    const body = seams.body.peek();
    await channel.dispatch(
      body ? { ...ctx, body } : ctx,
      method,
      rest,
      url,
      req,
      seams.client,
    );
    if (res.statusCode >= 400) message.release?.();
  },
});
