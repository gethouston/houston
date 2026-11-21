import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { IntegrationRegistry } from "../integrations/registry";
import { json, readJson } from "./http";
import { handleProviderRequest } from "./integrations-provider";
import { defineRouteFamily } from "./registry";

export {
  relayIntegrationUpstreamError,
  signinRequired,
} from "./integrations-errors";

export interface IntegrationDeps {
  registry: IntegrationRegistry;
  session?: { set(token: string | null): void };
  reconnectNotice?: {
    active(): boolean;
    dismiss(): void | Promise<void>;
  };
}

const SOURCE = "packages/host/src/routes/integrations.ts";

async function handleIntegrations(
  deps: { integrations?: IntegrationDeps },
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (!path.startsWith("/v1/integrations")) return false;

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
