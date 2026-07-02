import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { IntegrationProvider } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import { IntegrationSigninRequiredError } from "../integrations/types";
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
   * A legacy "Composio for you" credentials file was found on disk: the user
   * connected apps under the old per-user-account model and must reconnect
   * them once (surfaced in the UI as a security improvement, which it is —
   * their long-lived personal key is no longer used anywhere).
   */
  reconnectNotice?: boolean;
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
  const { registry, session, reconnectNotice } = deps.integrations;

  // GET /v1/integrations — per-provider readiness (never a secret).
  if (path === "/v1/integrations" && method === "GET") {
    const items = await Promise.all(
      registry.ids().map(async (id) => {
        const readiness = await registry.get(id).readiness();
        return {
          provider: id,
          ready: readiness.ready,
          ...(readiness.reason ? { reason: readiness.reason } : {}),
          ...(reconnectNotice ? { reconnect: true } : {}),
        };
      }),
    );
    json(res, 200, { items });
    return true;
  }

  // PUT /v1/integrations/session — the frontend keeps the gateway adapter's
  // Supabase token fresh (sign-in, refresh, sign-out → null). Local only; a
  // deployment without a gateway has no sink and answers 404.
  if (path === "/v1/integrations/session" && method === "PUT") {
    if (!session) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const { token } = await readJson(req);
    if (token !== null && typeof token !== "string") {
      json(res, 400, { error: "missing 'token' (string or null)" });
      return true;
    }
    session.set(token);
    json(res, 200, { ok: true });
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
      const conn = await provider.connection(userId, connPoll);
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
    throw err;
  }

  json(res, 404, { error: "not found" });
  return true;
}
