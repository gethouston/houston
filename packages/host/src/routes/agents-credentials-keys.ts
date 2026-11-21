import { parseClaudeOAuthEnvelope } from "@houston/protocol";
import { RevokedRefillBlockedError } from "../credentials/revocation-tombstones";
import { ApiKeyRejectedError } from "../ports";
import { isApiKeyProvider } from "../providers";
import { channelFor, noChannel } from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

const HERE = "packages/host/src/routes/agents-credentials-keys.ts";

defineRoute({
  group: "agent-credentials",
  method: "POST",
  path: "/agents/:agentId/credential/api-key",
  phase: "agent",
  classification: "sdk",
  source: HERE,
  async handler({ deps, authz, actingAs, req, res }) {
    const { provider, apiKey: key, endpoint } = await readJson(req);
    if (
      !provider ||
      typeof provider !== "string" ||
      !isApiKeyProvider(provider)
    )
      return json(res, 400, { error: "unknown API-key provider" });
    if (!key || typeof key !== "string" || !key.trim())
      return json(res, 400, { error: "missing 'apiKey'" });
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    try {
      await channel.saveApiKeyCredential(
        { workspace: authz.workspace, agent: authz.agent, actingAs },
        provider,
        key.trim(),
        typeof endpoint === "string" && endpoint.trim()
          ? endpoint.trim()
          : undefined,
      );
      json(res, 200, { ok: true, provider });
    } catch (err) {
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof ApiKeyRejectedError && err.reason
          ? { reason: err.reason }
          : {}),
      });
    }
  },
});

defineRoute({
  group: "agent-credentials",
  method: "POST",
  path: "/agents/:agentId/credential/claude-oauth",
  phase: "agent",
  classification: "sdk",
  source: HERE,
  async handler({ deps, authz, actingAs, url, req, res }) {
    const parsed = parseClaudeOAuthEnvelope(
      await readJson(req).catch(() => ({})),
    );
    if (!parsed.ok) return json(res, 400, { error: parsed.error });
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    try {
      await channel.saveClaudeOAuthCredential(
        { workspace: authz.workspace, agent: authz.agent, actingAs },
        parsed.value,
        { ifAbsent: url.searchParams.get("if_absent") === "1" },
      );
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, err instanceof RevokedRefillBlockedError ? 409 : 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
