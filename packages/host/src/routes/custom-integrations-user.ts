import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import { agentRest } from "./agent-rest";
import { customTargetOf } from "./custom-integrations";
import { serveCustomTarget } from "./custom-integrations-serve";
import { json } from "./http";
import { defineRouteFamily, type HttpMethod } from "./registry";

/**
 * Custom-integration USER routes (HOU-550): list / add / detect / remove /
 * provide-credential / list-tools — what the Integrations page (rows, the
 * manual add form, the detail card) and the in-chat credential card call. The
 * credential value crosses ONLY here (HTTPS body → secret store); it never
 * rides the chat transcript.
 *
 * TWO surfaces serve the same routes:
 *
 *  - `/v1/integrations/custom/*` — the top-level form, for the global
 *    Integrations page against a direct host.
 *  - the per-agent dispatch `/agents/:agentId/integrations/custom/*` — the ONE
 *    per-agent surface the hosted gateway proxies to a pod. The gateway mounts
 *    NO `/v1/integrations/custom/*` route (its integrations subtree is
 *    Composio-only), so a client fronted by it MUST call this form: the
 *    top-level POST 404ed at the gateway and broke the in-chat secure
 *    credential card on every managed-cloud save (HOU-823).
 *
 * The definitions and their secrets are user-global on this single-user host —
 * the agent id on the dispatch form authorizes and routes (it is how the
 * gateway finds the pod), it does not scope the data.
 */
export interface CustomIntegrationUserDeps {
  customIntegrations?: CustomIntegrationManager;
}

const SOURCE = "packages/host/src/routes/custom-integrations-user.ts";

const TOP = /^\/v1\/integrations\/custom\/(.+)$/;
const DISPATCH = /^integrations\/custom\/(.+)$/;

/** The top-level `/v1` form. Mounted BEFORE the generic
 *  `/v1/integrations/:provider/*` handler in server.ts — a target the grammar
 *  does not know falls through to it (`custom/connections` etc. stay generic). */
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

/**
 * The SAME routes matched on the per-agent `rest`, for the two chains that run
 * behind their own ownership check: the dispatch surface below, and the pod's
 * op chain (op/handler-chain.ts). Unwired manager → false, so the request keeps
 * travelling toward the agent's engine like any unknown rest.
 */
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

/** The grammar of custom-integrations.ts, as the pairs a surface publishes. */
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

/**
 * The `/v1` mount, served by the handler above.
 *
 * It claims its whole subtree for EVERY method because that is what the mount
 * regex does: the grammar, not the method table, decides what belongs here, so
 * an unwired manager answers 404 for any method (the client learns the feature
 * is absent instead of that its URL is wrong) and a target the grammar rejects
 * is DECLINED — which is the only reason the generic provider family mounted
 * after this one still answers `custom/connections`.
 */
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

/**
 * The same routes on the PER-AGENT dispatch surface, behind the agent phase's
 * ownership check. It DECLINES — rather than 404ing like the `/v1` mounts —
 * whenever the manager is unwired or the grammar does not know the target,
 * because the family behind it here is the agent's own engine: a probe for
 * something else under `integrations/` belongs to the engine, and on a host
 * with no custom-integration manager the whole subtree does.
 */
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
