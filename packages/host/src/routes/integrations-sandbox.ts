import type { IncomingMessage, ServerResponse } from "node:http";
import { IntegrationSigninRequiredError } from "../integrations/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { bearer, json, readJson } from "./http";
import { type IntegrationDeps, signinRequired } from "./integrations";

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

  try {
    if (m[1] === "search") {
      if (typeof body.query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return true;
      }
      json(res, 200, {
        items: await provider.search(ws.ownerUserId, body.query),
      });
      return true;
    }

    // execute
    if (typeof body.action !== "string") {
      json(res, 400, { error: "missing 'action'" });
      return true;
    }
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};
    json(res, 200, await provider.execute(ws.ownerUserId, body.action, params));
    return true;
  } catch (err) {
    if (err instanceof IntegrationSigninRequiredError) {
      signinRequired(res);
      return true;
    }
    throw err;
  }
}
