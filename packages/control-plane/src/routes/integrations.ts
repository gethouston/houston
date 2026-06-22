import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { IntegrationCredentialStore } from "../integrations/credential-store";
import type { IntegrationRegistry } from "../integrations/registry";
import type { IntegrationProvider } from "../integrations/provider";
import type { ProviderCredential } from "../integrations/types";
import { bearer, json, readJson } from "./http";

/**
 * Third-party integrations (Composio "for you" first). Two surfaces:
 *
 *  - USER routes (`/v1/integrations/*`, authed as the signed-in user): the
 *    click-through login, the toolkit catalog, a user's connections, connect
 *    (deep-link to the provider's hosted connect), disconnect, logout.
 *  - The RUNTIME proxy (`/sandbox/integrations/*`, authed by the per-sandbox
 *    HMAC token): the agent's `integration_search` / `integration_execute` tools
 *    call THIS, never the provider directly — so the user's long-lived key stays
 *    host-side (same custody gate as `/sandbox/credential`). The host resolves
 *    the sandbox → its workspace owner → that user's stored credential.
 */
export interface IntegrationDeps {
  registry: IntegrationRegistry;
  credentials: IntegrationCredentialStore;
}

/** Resolve the provider from the URL segment, or 404. */
function providerOr404(
  registry: IntegrationRegistry,
  id: string | undefined,
  res: ServerResponse,
): IntegrationProvider | null {
  if (id && registry.has(id)) return registry.get(id);
  json(res, 404, { error: `unknown integration provider '${id ?? ""}'` });
  return null;
}

const notConnected = (res: ServerResponse) =>
  json(res, 409, { error: "integration not connected" });

// ── User-facing routes ───────────────────────────────────────────────────────

export async function handleIntegrations(
  deps: { integrations?: IntegrationDeps },
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (!path.startsWith("/v1/integrations")) return false;
  if (!deps.integrations) {
    json(res, 503, { error: "integrations not configured" });
    return true;
  }
  const { registry, credentials } = deps.integrations;

  // GET /v1/integrations — per-provider connection status (no secret leaves here).
  if (path === "/v1/integrations" && method === "GET") {
    const items = await Promise.all(
      registry.ids().map(async (id) => {
        const cred = await credentials.get(userId, id);
        if (!cred) return { provider: id, connected: false };
        const identity = await registry.get(id).verifyCredential(cred);
        return identity
          ? { provider: id, connected: true, account: identity }
          : { provider: id, connected: false };
      }),
    );
    json(res, 200, { items });
    return true;
  }

  const m = path.match(/^\/v1\/integrations\/([^/]+)\/(.+)$/);
  if (!m) return false;
  const provider = providerOr404(registry, m[1], res);
  if (!provider) return true;
  const sub = m[2];

  // Login: start (no credential yet) then poll until linked, storing the result.
  if (sub === "login/start" && method === "POST") {
    json(res, 200, await provider.startLogin());
    return true;
  }
  if (sub === "login/poll" && method === "POST") {
    const { pollKey } = await readJson(req);
    if (!pollKey || typeof pollKey !== "string") {
      json(res, 400, { error: "missing 'pollKey'" });
      return true;
    }
    const result = await provider.pollLogin(pollKey);
    if (result.status === "linked") {
      await credentials.put(userId, result.credential);
      const identity = await provider.verifyCredential(result.credential);
      json(res, 200, { status: "linked", account: identity });
    } else {
      json(res, 200, { status: "pending" });
    }
    return true;
  }

  if (sub === "logout" && method === "POST") {
    await credentials.remove(userId, provider.id);
    json(res, 200, { ok: true });
    return true;
  }

  // Everything below needs the user's connected credential.
  const cred = await credentials.get(userId, provider.id);
  if (!cred) {
    notConnected(res);
    return true;
  }

  if (sub === "toolkits" && method === "GET") {
    json(res, 200, { items: await provider.listToolkits(cred) });
    return true;
  }
  if (sub === "connections" && method === "GET") {
    json(res, 200, { items: await provider.listConnections(cred) });
    return true;
  }
  if (sub === "connect" && method === "POST") {
    const { toolkit } = await readJson(req);
    if (!toolkit || typeof toolkit !== "string") {
      json(res, 400, { error: "missing 'toolkit'" });
      return true;
    }
    json(res, 200, await provider.connect(cred, toolkit));
    return true;
  }
  if (sub === "disconnect" && method === "POST") {
    const { toolkit } = await readJson(req);
    if (!toolkit || typeof toolkit !== "string") {
      json(res, 400, { error: "missing 'toolkit'" });
      return true;
    }
    await provider.disconnect(cred, toolkit);
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { error: "not found" });
  return true;
}

// ── Runtime-facing proxy (HMAC sandbox token) ────────────────────────────────

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
  const { registry, credentials } = deps.integrations;

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

  // The sandbox proves its workspace; the integration credential is the
  // workspace owner's own connected account.
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  if (!ws) {
    json(res, 404, { error: "workspace not found" });
    return true;
  }
  const cred: ProviderCredential | null = await credentials.get(
    ws.ownerUserId,
    providerId,
  );
  if (!cred) {
    notConnected(res);
    return true;
  }

  if (m[1] === "search") {
    if (typeof body.query !== "string") {
      json(res, 400, { error: "missing 'query'" });
      return true;
    }
    json(res, 200, { items: await provider.search(cred, body.query) });
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
  json(res, 200, await provider.execute(cred, body.action, params));
  return true;
}
