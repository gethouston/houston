import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { IntegrationProvider } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import {
  IntegrationSigninRequiredError,
  IntegrationUpstreamError,
} from "../integrations/types";
import { json, readJson } from "./http";

/**
 * Third-party integrations (Composio platform mode first) — the USER routes
 * (`/v1/integrations/*`, authed as the signed-in user): the toolkit catalog,
 * the user's connections, connect (a real OAuth redirect — the user authorizes
 * the app itself, never the provider), a connection poll, disconnect, plus
 * search/execute for the desktop gateway. There is no provider login: the
 * platform key lives with the deployment (cloud/self-host) or upstream behind
 * the gateway adapter. The runtime-facing proxy lives in
 * integrations-sandbox.ts.
 */
export interface IntegrationDeps {
  registry: IntegrationRegistry;
  /**
   * Where the frontend pushes the user's Supabase session token for the
   * gateway adapter (desktop only — the cloud host verifies JWTs itself).
   */
  session?: { set(token: string | null): void };
  /**
   * A legacy "Composio for you" credentials file on disk means the user
   * connected apps under the old per-user-account model and must reconnect
   * them once (surfaced in the UI as a security improvement, which it is —
   * their long-lived personal key is no longer used anywhere). Local profile
   * only; cloud deployments have no legacy file and leave this absent.
   */
  reconnectNotice?: {
    /** Live check per request — dismissal must clear the banner without a restart. */
    active(): boolean;
    /**
     * Delete the legacy file (it holds the user's retired plaintext key).
     * Idempotent — already-gone is success; a real failure (EACCES…) throws
     * and surfaces as an error response, never swallowed.
     */
    dismiss(): void | Promise<void>;
  };
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

/** 409 + code for "the user must sign in to Houston first" (shared with the
 *  sandbox proxy in integrations-sandbox.ts). */
export const signinRequired = (res: ServerResponse) =>
  json(res, 409, {
    error: "sign in to Houston to use integrations",
    code: "signin_required",
  });

export const relayIntegrationUpstreamError = (
  res: ServerResponse,
  err: unknown,
): boolean => {
  if (!(err instanceof IntegrationUpstreamError)) return false;
  json(res, err.status, err.body);
  return true;
};

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

  // PUT /v1/integrations/session — the frontend keeps the gateway adapter's
  // Supabase token fresh (sign-in, refresh, sign-out → null). Deployments
  // without a gateway sink accept it as a no-op so signed-in users never see a
  // bogus red toast in direct-key/self-host/no-integrations builds.
  if (path === "/v1/integrations/session" && method === "PUT") {
    const { token } = await readJson(req);
    if (token !== null && typeof token !== "string") {
      json(res, 400, { error: "missing 'token' (string or null)" });
      return true;
    }
    deps.integrations?.session?.set(token);
    json(res, 200, { ok: true });
    return true;
  }

  // POST /v1/integrations/reconnect-notice/dismiss — delete the legacy
  // "Composio for you" credentials file (it holds the user's retired plaintext
  // key) and clear the banner. Local-only wiring; deployments without a legacy
  // path (cloud) accept it as a no-op, mirroring the session sink above.
  // Idempotent: 200 even when the file is already gone. A real deletion
  // failure throws → the server's error handler surfaces it, never swallowed.
  if (
    path === "/v1/integrations/reconnect-notice/dismiss" &&
    method === "POST"
  ) {
    await deps.integrations?.reconnectNotice?.dismiss();
    json(res, 200, { ok: true });
    return true;
  }

  if (!deps.integrations) {
    json(res, 503, { error: "integrations not configured" });
    return true;
  }
  const { registry, reconnectNotice } = deps.integrations;

  // GET /v1/integrations — per-provider readiness (never a secret). The
  // reconnect flag is re-checked live so a dismiss takes effect immediately.
  if (path === "/v1/integrations" && method === "GET") {
    const reconnect = reconnectNotice?.active() ?? false;
    const items = await Promise.all(
      registry.ids().map(async (id) => {
        const readiness = await registry.get(id).readiness();
        return {
          provider: id,
          ready: readiness.ready,
          ...(readiness.reason ? { reason: readiness.reason } : {}),
          ...(reconnect ? { reconnect: true } : {}),
        };
      }),
    );
    json(res, 200, { items });
    return true;
  }

  const m = path.match(/^\/v1\/integrations\/([^/]+)\/(.+)$/);
  if (!m) return false;
  const provider = providerOr404(registry, m[1], res);
  if (!provider) return true;
  const sub = m[2] ?? "";

  try {
    if (sub === "toolkits" && method === "GET") {
      json(res, 200, { items: await provider.listToolkits() });
      return true;
    }
    if (sub === "connections" && method === "GET") {
      json(res, 200, { items: await provider.listConnections(userId) });
      return true;
    }
    const connPoll = sub.match(/^connections\/([^/]+)$/)?.[1];
    if (connPoll && method === "GET") {
      // The client encodes the id (engine-client encodeURIComponent). Composio
      // UUIDs survive either way; an MCP id ("mcp:composio-apps") arrives as
      // "mcp%3A…" and must decode or the connect card polls 404 forever.
      const conn = await provider.connection(
        userId,
        decodeURIComponent(connPoll),
      );
      if (!conn) json(res, 404, { error: "connection not found" });
      else json(res, 200, conn);
      return true;
    }
    if (sub === "connect" && method === "POST") {
      const { toolkit } = await readJson(req);
      if (!toolkit || typeof toolkit !== "string") {
        json(res, 400, { error: "missing 'toolkit'" });
        return true;
      }
      json(res, 200, await provider.connect(userId, toolkit));
      return true;
    }
    if (sub === "disconnect" && method === "POST") {
      const { toolkit } = await readJson(req);
      if (!toolkit || typeof toolkit !== "string") {
        json(res, 400, { error: "missing 'toolkit'" });
        return true;
      }
      await provider.disconnect(userId, toolkit);
      json(res, 200, { ok: true });
      return true;
    }
    if (sub === "search" && method === "POST") {
      const { query } = await readJson(req);
      if (typeof query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return true;
      }
      json(res, 200, { items: await provider.search(userId, query) });
      return true;
    }
    if (sub === "execute" && method === "POST") {
      const body = await readJson(req);
      if (typeof body.action !== "string") {
        json(res, 400, { error: "missing 'action'" });
        return true;
      }
      const params =
        body.params && typeof body.params === "object"
          ? (body.params as Record<string, unknown>)
          : {};
      json(res, 200, await provider.execute(userId, body.action, params));
      return true;
    }
  } catch (err) {
    if (err instanceof IntegrationSigninRequiredError) {
      signinRequired(res);
      return true;
    }
    if (relayIntegrationUpstreamError(res, err)) return true;
    throw err;
  }

  json(res, 404, { error: "not found" });
  return true;
}
