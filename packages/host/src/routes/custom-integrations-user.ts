import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import { agentRest } from "./agent-rest";
import { customTargetOf } from "./custom-integrations";
import { serveCustomTarget } from "./custom-integrations-serve";
import { json } from "./http";
import { defineRouteFamily, type HttpMethod } from "./registry";

export interface CustomIntegrationUserDeps {
  customIntegrations?: CustomIntegrationManager;
}

const SOURCE = "packages/host/src/routes/custom-integrations-user.ts";

const TOP = /^\/v1\/integrations\/custom\/(.+)$/;
const DISPATCH = /^integrations\/custom\/(.+)$/;

export async function handleCustomIntegrations(
  deps: CustomIntegrationUserDeps,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const rest = path.match(TOP)?.[1];
  const target = rest ? customTargetOf(rest) : null;
  if (!target) return false;
  const manager = deps.customIntegrations;
  if (!manager) {
    json(res, 404, { error: "custom integrations not available here" });
    return true;
  }
  return serveCustomTarget(manager, method, target, req, res);
}

export async function handleCustomIntegrationsDispatch(
  manager: CustomIntegrationManager | undefined,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const m = rest.match(DISPATCH);
  const target = m ? customTargetOf(m[1] ?? "") : null;
  if (!target || !manager) return false;
  return serveCustomTarget(manager, method, target, req, res);
}

const OPS: { method: HttpMethod; target: string }[] = [
  { method: "GET", target: "definitions" },
  { method: "POST", target: "definitions" },
  { method: "POST", target: "detect" },
  { method: "PATCH", target: "definitions/:slug" },
  { method: "DELETE", target: "definitions/:slug" },
  { method: "GET", target: "definitions/:slug/tools" },
  { method: "POST", target: "definitions/:slug/oauth/start" },
  { method: "POST", target: "definitions/:slug/credential" },
];

const members = (mount: string) =>
  OPS.map(({ method, target }) => ({ method, path: `${mount}/${target}` }));

defineRouteFamily({
  group: "custom-integrations",
  phase: "user",
  classification: "sdk",
  source: SOURCE,
  members: members("/v1/integrations/custom"),
  owns: ["/v1/integrations/custom/*rest"],
  handler: ({ deps, method, path, req, res }) =>
    handleCustomIntegrations(deps, method, path, req, res),
});

defineRouteFamily({
  group: "agent-integrations",
  phase: "agent",
  classification: "sdk",
  source: SOURCE,
  members: members("/agents/:agentId/integrations/custom"),
  owns: ["/agents/:agentId/integrations/custom/*rest"],
  handler: ({ deps, method, path, req, res }) =>
    handleCustomIntegrationsDispatch(
      deps.customIntegrations,
      method,
      agentRest(path),
      req,
      res,
    ),
});
