import type { IncomingMessage, ServerResponse } from "node:http";
import {
  filterMatchesToGranted,
  isActionGranted,
  type LocalIntegrationGrants,
} from "../integrations/grants";
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
    json(res, 503, { error: "integrations not configured" });
    return true;
  }
  const { registry } = deps.integrations;

  const body = await readJson(req);
  // Default to the only/first provider when the tool omits it (single-provider).
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
      const items = await provider.search(ws.ownerUserId, body.query, acting);
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
    if (granted && !isActionGranted(body.action, granted)) {
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
