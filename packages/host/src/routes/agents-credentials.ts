import { channelFor, noChannel } from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

/**
 * Connect-once, the two halves that move a credential in and out of the
 * WORKSPACE store: capture after the user connected an agent's subscription,
 * forget when they disconnect. Both are declared ahead of the runtime dispatch
 * (routes/agents.ts) because the agent's own engine has no such route.
 */
const HERE = "packages/host/src/routes/agents-credentials.ts";

/**
 * Capture: after the user connects an agent's subscription, persist the
 * credential for the WHOLE workspace so every agent (existing + new) serves
 * from it.
 */
defineRoute({
  group: "agent-credentials",
  method: "POST",
  path: "/agents/:agentId/credential/capture",
  phase: "agent",
  classification: "sdk",
  source: HERE,
  async handler({ deps, authz, actingAs, req, res }) {
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    // The just-connected provider id, so capture exports THAT credential rather
    // than whichever OAuth credential comes first in the runtime's auth.json.
    const body = (await readJson(req).catch(() => ({}))) as {
      provider?: unknown;
    };
    const provider =
      typeof body.provider === "string" ? body.provider : undefined;
    const result = await channel.captureCredential(
      { workspace: authz.workspace, agent: authz.agent, actingAs },
      provider,
    );
    if (result.ok)
      return json(res, 200, { ok: true, provider: result.provider });
    json(res, result.status, {
      error: result.error,
      ...(result.detail ? { detail: result.detail } : {}),
    });
  },
});

/**
 * Forget (connect-once logout): drop the workspace credential for a provider so
 * no future turn can re-serve it. Clearing only the agent runtime's local
 * auth.json left the central store intact, and the next turn re-hydrated the
 * agent from it — the provider showed connected again.
 */
defineRoute({
  group: "agent-credentials",
  method: "POST",
  path: "/agents/:agentId/credential/forget",
  phase: "agent",
  classification: "sdk",
  source: HERE,
  async handler({ deps, authz, actingAs, req, res }) {
    const { provider } = await readJson(req);
    if (!provider || typeof provider !== "string")
      return json(res, 400, { error: "missing 'provider'" });
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    await channel.forgetCredential(
      { workspace: authz.workspace, agent: authz.agent, actingAs },
      provider,
    );
    if (
      provider === "openai-compatible" &&
      deps.gatewayFronted &&
      deps.sharedEndpoints
    ) {
      try {
        await deps.sharedEndpoints.remove({ ownerOnly: true });
      } catch (err) {
        console.error(
          "[shared-endpoint] owner-only logout cleanup failed:",
          err,
        );
        return json(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    json(res, 200, { ok: true });
  },
});
