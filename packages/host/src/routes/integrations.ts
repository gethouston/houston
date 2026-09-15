import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { IntegrationRegistry } from "../integrations/registry";
import { json, readJson } from "./http";
import { handleProviderRequest } from "./integrations-provider";
import { defineRouteFamily } from "./registry";

/**
 * Third-party integrations (Composio platform mode first) — the USER routes
 * (`/v1/integrations/*`, authed as the signed-in user): the toolkit catalog,
 * the user's connections, connect (a real OAuth redirect — the user authorizes
 * the app itself, never the provider), a connection poll, disconnect, plus
 * search/execute for the desktop gateway. There is no provider login: the
 * platform key lives with the deployment (cloud/self-host) or upstream behind
 * the gateway adapter. The per-provider half lives in integrations-provider.ts
 * and the runtime-facing proxy in integrations-sandbox.ts.
 */
export {
  relayIntegrationUpstreamError,
  signinRequired,
} from "./integrations-errors";

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

const SOURCE = "packages/host/src/routes/integrations.ts";

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
  await handleProviderRequest(
    registry,
    userId,
    m[1],
    m[2] ?? "",
    method,
    req,
    res,
  );
  return true;
}

/**
 * The module owns the whole `/v1/integrations` subtree for EVERY method, which
 * is what its prefix guard has always done: on a deployment with no
 * integrations wired, anything in here answers 503 "integrations not
 * configured" — the client learns the feature is absent rather than that its
 * URL is wrong — and a wired one answers 404 for a provider or a sub it does
 * not know. Nothing is normalised, so the bare and trailing-slash forms are
 * separate paths the same handler answers.
 *
 * The custom-integrations group is mounted BEFORE this one for exactly this
 * reason: this claim would otherwise swallow `/v1/integrations/custom/*`.
 */
defineRouteFamily({
  group: "integrations",
  phase: "user",
  classification: "sdk",
  source: SOURCE,
  members: [
    { method: "PUT", path: "/v1/integrations/session" },
    { method: "POST", path: "/v1/integrations/reconnect-notice/dismiss" },
    { method: "GET", path: "/v1/integrations" },
    { method: "GET", path: "/v1/integrations/:provider/toolkits" },
    { method: "GET", path: "/v1/integrations/:provider/connections" },
    {
      method: "GET",
      path: "/v1/integrations/:provider/connections/:connectionId",
    },
    { method: "POST", path: "/v1/integrations/:provider/connect" },
    { method: "POST", path: "/v1/integrations/:provider/disconnect" },
    { method: "POST", path: "/v1/integrations/:provider/search" },
    { method: "POST", path: "/v1/integrations/:provider/execute" },
  ],
  owns: ["/v1/integrations", "/v1/integrations/", "/v1/integrations/*rest"],
  handler: ({ deps, userId, method, path, req, res }) =>
    handleIntegrations(deps, userId, method, path, req, res),
});
