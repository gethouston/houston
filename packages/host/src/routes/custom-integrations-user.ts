import type { IncomingMessage, ServerResponse } from "node:http";
import { canUseAgent } from "../domain/access";
import type { UserId } from "../domain/types";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import type { WorkspaceStore } from "../ports";
import {
  bodyOr400,
  type CustomTarget,
  customTargetOf,
  parseAddInput,
  relayCustomError,
} from "./custom-integrations";
import { json } from "./http";

/**
 * Custom-integration USER routes (HOU-550): list / add / detect / remove /
 * provide-credential / list-tools — what the Integrations page (rows, the
 * manual add form, the detail card) and the in-chat credential card call. The
 * credential value crosses ONLY here (HTTPS body → secret store); it never
 * rides the chat transcript.
 *
 * THREE surfaces serve the same routes:
 *
 *  - `/v1/integrations/custom/*` — the original top-level form, for the global
 *    Integrations page against a direct host.
 *  - `/v1/agents/:agentId/integrations/custom/*` — the agent-scoped wrapper
 *    for direct API callers (ownership-checked here).
 *  - the per-agent dispatch `/agents/:agentId/integrations/custom/*` — the ONE
 *    per-agent surface the hosted gateway proxies to a pod. The gateway mounts
 *    NO `/v1/integrations/custom/*` route (its integrations subtree is
 *    Composio-only), so a client fronted by it MUST call this form: the
 *    top-level POST 404ed at the gateway and broke the in-chat secure
 *    credential card on every managed-cloud save (HOU-823).
 *
 * The definitions and their secrets are user-global on this single-user host —
 * the agent id on the scoped forms authorizes and routes (it is how the
 * gateway finds the pod), it does not scope the data.
 */
export interface CustomIntegrationUserDeps {
  customIntegrations?: CustomIntegrationManager;
  store: WorkspaceStore;
}

const TOP = /^\/v1\/integrations\/custom\/(.+)$/;
const AGENT = /^\/v1\/agents\/([^/]+)\/integrations\/custom\/(.+)$/;
const DISPATCH = /^integrations\/custom\/(.+)$/;

/** Ownership check mirroring the other agent routes (personal tier = owner-only). */
async function authorize(
  store: WorkspaceStore,
  userId: UserId,
  agentId: string,
): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  const agent = await store.getAgent(agentId);
  const workspace = agent ? await store.getWorkspace(agent.workspaceId) : null;
  const access = canUseAgent({ userId, agent, workspace });
  if (access.ok) return { ok: true };
  return {
    ok: false,
    status: access.reason === "agent not found" ? 404 : 403,
    reason: access.reason,
  };
}

/** The surface-agnostic core: serve one user request against the manager.
 *  Returns false when method+shape name no route in this family. */
async function serve(
  manager: CustomIntegrationManager,
  method: string,
  target: CustomTarget,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  try {
    if (target.kind === "definitions" && method === "GET") {
      json(res, 200, { items: await manager.list() });
      return true;
    }
    // The manual add form (HOU-980). Same body grammar as the agent's
    // sandbox add tool — parseAddInput is the one validator for both.
    if (target.kind === "definitions" && method === "POST") {
      const body = await bodyOr400(req, res);
      if (!body) return true;
      const input = parseAddInput(body);
      if (typeof input === "string") {
        json(res, 400, { error: input });
        return true;
      }
      json(res, 200, await manager.add(input));
      return true;
    }
    if (target.kind === "detect" && method === "POST") {
      const body = await bodyOr400(req, res);
      if (!body) return true;
      if (typeof body.url !== "string" || !body.url.trim()) {
        json(res, 400, { error: "missing 'url'" });
        return true;
      }
      json(res, 200, await manager.detect(body.url.trim()));
      return true;
    }
    if (target.kind === "definition" && method === "DELETE") {
      await manager.remove(target.slug);
      json(res, 200, { ok: true });
      return true;
    }
    if (target.kind === "tools" && method === "GET") {
      json(res, 200, { items: await manager.tools(target.slug) });
      return true;
    }
    // OAuth sign-in start (PRODUCT-1172): mint the authorize URL the client
    // opens in the browser; the redirect lands on the PUBLIC callback route
    // (custom-integrations-oauth.ts), which completes the flow server-side.
    if (target.kind === "oauthStart" && method === "POST") {
      json(res, 200, await manager.startOAuth(target.slug));
      return true;
    }
    if (target.kind === "credential" && method === "POST") {
      const body = await bodyOr400(req, res);
      if (!body) return true;
      const values = body.values;
      if (
        !values ||
        typeof values !== "object" ||
        Array.isArray(values) ||
        !Object.values(values).every((v) => typeof v === "string")
      ) {
        json(res, 400, { error: "missing 'values' (object of strings)" });
        return true;
      }
      json(
        res,
        200,
        await manager.setCredential(
          target.slug,
          values as Record<string, string>,
        ),
      );
      return true;
    }
  } catch (err) {
    if (relayCustomError(res, err)) return true;
    throw err;
  }
  return false;
}

/** The two `/v1` forms (top-level + agent-scoped). Mounted BEFORE the generic
 *  `/v1/integrations/:provider/*` handler in server.ts — a target the grammar
 *  does not know falls through to it (`custom/connections` etc. stay generic). */
export async function handleCustomIntegrations(
  deps: CustomIntegrationUserDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const top = path.match(TOP);
  const scoped = top ? null : path.match(AGENT);
  const rest = top?.[1] ?? scoped?.[2];
  const target = rest ? customTargetOf(rest) : null;
  if (!target) return false;
  const manager = deps.customIntegrations;
  if (!manager) {
    json(res, 404, { error: "custom integrations not available here" });
    return true;
  }
  if (scoped) {
    let agentId: string;
    try {
      agentId = decodeURIComponent(scoped[1] ?? "");
    } catch {
      // A malformed escape in the agent segment is a client error, never a 500.
      json(res, 400, { error: "malformed agent id" });
      return true;
    }
    const authz = await authorize(deps.store, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
  }
  return serve(manager, method, target, req, res);
}

/**
 * The SAME routes on the per-agent dispatch surface, matched on the dispatch
 * `rest` inside handleAgents — which has ALREADY run the ownership check, so
 * no authz here. This is the surface the hosted gateway proxies to the pod,
 * and the one the shipped clients call in both deployments. Unwired manager →
 * false, and the request falls through toward the runtime channel like any
 * unknown dispatch family.
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
  return serve(manager, method, target, req, res);
}
