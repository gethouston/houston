import { channelFor, noChannel } from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

const HERE = "packages/host/src/routes/agents-credentials.ts";

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
