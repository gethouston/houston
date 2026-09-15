import { parseClaudeOAuthEnvelope } from "@houston/protocol";
import { RevokedRefillBlockedError } from "../credentials/revocation-tombstones";
import { ApiKeyRejectedError } from "../ports";
import { isApiKeyProvider } from "../providers";
import { channelFor, noChannel } from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

/**
 * The two credential connects the user drives by hand rather than through an
 * OAuth dance in the agent's runtime: a pasted API key, and the Claude
 * subscription pushed in from the desktop.
 */
const HERE = "packages/host/src/routes/agents-credentials-keys.ts";

/**
 * Connect an API-key provider: the user pastes a key, no OAuth dance. Stored
 * centrally for the whole workspace (and pushed into the standing runtime so it
 * reads as connected at once).
 */
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
      // Forward the runtime's typed verification reason so the connect
      // dialog can show actionable copy (bad key vs restricted key vs outage).
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof ApiKeyRejectedError && err.reason
          ? { reason: err.reason }
          : {}),
      });
    }
  },
});

/**
 * Connect the Claude subscription in HOSTED mode: `claude auth login` mints the
 * OAuth credential locally on the desktop, which extracts it and pushes it here
 * so a hosted pod's Claude Agent SDK can authenticate + self-refresh. Same owner
 * authz as capture. The envelope is validated (accessToken required) — a
 * malformed push is a clear 4xx (never a false success), so the desktop can fall
 * back to the paste flow.
 */
defineRoute({
  group: "agent-credentials",
  method: "POST",
  path: "/agents/:agentId/credential/claude-oauth",
  phase: "agent",
  classification: "sdk",
  source: HERE,
  async handler({ deps, authz, actingAs, url, req, res }) {
    // A body that isn't valid JSON parses to {} → the validator rejects it as
    // "missing 'claudeAiOauth'" (a clean 400), never a swallowed accept.
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
        // `?if_absent=1` marks a fill-only push of a CACHED snapshot (the
        // desktop reconcile) — never allowed to clobber a live central
        // credential whose refresh token may have rotated since (HOU-855).
        { ifAbsent: url.searchParams.get("if_absent") === "1" },
      );
      json(res, 200, { ok: true });
    } catch (err) {
      // 409, not 502: the fill was refused on purpose (the credential was
      // just provider-revoked — HOUSTON-APP-530), not lost to a broken hop.
      json(res, err instanceof RevokedRefillBlockedError ? 409 : 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
