import type { IncomingMessage, ServerResponse } from "node:http";
import {
  filterMatchesToGranted,
  isActionGranted,
  type LocalIntegrationGrants,
} from "../integrations/grants";
import { searchAllProviders } from "../integrations/search-fanout";
import { IntegrationSigninRequiredError } from "../integrations/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { bearer, header, json, readJson } from "./http";
import {
  type IntegrationDeps,
  relayIntegrationUpstreamError,
  signinRequired,
} from "./integrations";

/**
 * The RUNTIME-facing integrations proxy (`/sandbox/integrations/*`, authed by
 * the per-sandbox HMAC token): the agent's `integration_search` /
 * `integration_execute` tools call THIS, never the provider directly — no
 * integration secret ever sits in the agent runtime. The host resolves the
 * sandbox → its workspace owner → that user's id with the provider. The
 * user-facing routes live in integrations.ts.
 */
export async function handleSandboxIntegrations(
  deps: {
    vault: CredentialVault;
    store: WorkspaceStore;
    integrations?: IntegrationDeps;
    /**
     * Per-agent grants (LOCAL / self-host only; absent on gateway-fronted pods,
     * where the gateway already enforced before the request reached here). When
     * the acting agent HAS a stored record, search is filtered to granted
     * toolkits and execute of an ungranted toolkit is refused with 403.
     */
    integrationGrants?: LocalIntegrationGrants;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const m = path.match(/^\/sandbox\/integrations\/(search|execute)$/);
  if (!m || method !== "POST") return false;

  // Authenticate the sandbox (NOT a user JWT) — same gate as /sandbox/credential.
  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  if (!deps.integrations) {
    // A stable `code` marks THIS as the host's own not-configured signal (no
    // key in this install) — distinct from a transient upstream 503 the proxy
    // relays verbatim during an outage. The runtime tool classifies on the
    // code, never the bare status, so it never misdirects the user to set
    // COMPOSIO_API_KEY during a temporary gateway/provider failure.
    json(res, 503, {
      error: "integrations not configured",
      code: "integrations_not_configured",
    });
    return true;
  }
  const { registry } = deps.integrations;

  const body = await readJson(req);
  // Execute (and an explicit-provider search) target ONE provider: the id the
  // runtime echoes back from a search result's `provider` stamp, else the
  // first registered (composio whenever it is wired — registration order is
  // load-bearing). Search WITHOUT an explicit provider fans out instead.
  const providerId =
    typeof body.provider === "string" ? body.provider : registry.ids()[0];
  if (!providerId || !registry.has(providerId)) {
    json(res, 404, {
      error: `unknown integration provider '${providerId ?? ""}'`,
    });
    return true;
  }
  const provider = registry.get(providerId);

  // The sandbox proves its workspace; the provider acts as the workspace owner.
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  if (!ws) {
    json(res, 404, { error: "workspace not found" });
    return true;
  }

  // WHO the runtime is acting as this turn (C2): the gateway-minted acting-as
  // token for a live user, OR the routine creator's sub for a fired routine.
  // Both absent locally (single-user) → the provider falls back to the owner.
  const actingAs = header(req, "x-houston-acting-as");
  const actingUser = header(req, "x-houston-acting-user");
  const acting = actingAs || actingUser ? { actingAs, actingUser } : undefined;

  // The grant set for THIS agent (the sandbox token binds its id). null ⇒ no
  // record ⇒ backward-compatible pass-through (every connected app). Absent on
  // gateway-fronted pods, where the gateway already enforced upstream.
  const granted = deps.integrationGrants
    ? await deps.integrationGrants.grantedOrNull(claim.agentId)
    : null;

  try {
    if (m[1] === "search") {
      if (typeof body.query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return true;
      }
      const items =
        typeof body.provider === "string"
          ? await provider.search(ws.ownerUserId, body.query, acting)
          : await searchAllProviders(
              registry,
              ws.ownerUserId,
              body.query,
              acting,
            );
      json(res, 200, {
        items: granted ? filterMatchesToGranted(items, granted) : items,
      });
      return true;
    }

    // execute
    if (typeof body.action !== "string") {
      json(res, 400, { error: "missing 'action'" });
      return true;
    }
    // Grant check before the upstream call — an ungranted toolkit never runs.
    // Slug attribution (`GMAIL_SEND_EMAIL` → gmail) fits Composio's naming; an
    // MCP server's tools carry arbitrary names, so a grant of the provider's
    // OWN id (its single pseudo-toolkit, e.g. "composio-apps") also authorizes it.
    if (
      granted &&
      !isActionGranted(body.action, granted) &&
      !granted.includes(providerId)
    ) {
      json(res, 403, { error: "toolkit_not_granted" });
      return true;
    }
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};
    json(
      res,
      200,
      await provider.execute(ws.ownerUserId, body.action, params, acting),
    );
    return true;
  } catch (err) {
    if (err instanceof IntegrationSigninRequiredError) {
      signinRequired(res);
      return true;
    }
    if (relayIntegrationUpstreamError(res, err)) return true;
    throw err;
  }
}
