import type { IncomingMessage, ServerResponse } from "node:http";
import { canUseAgent } from "../domain/access";
import type { UserId } from "../domain/types";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import type { WorkspaceStore } from "../ports";
import { relayCustomError } from "./custom-integrations";
import { json, readJson } from "./http";

/**
 * Custom-integration USER routes (HOU-550): list / remove / provide-credential
 * — what the Integrations page and the in-chat credential card call. The
 * credential value crosses ONLY here (HTTPS body → secret store); it never
 * rides the chat transcript.
 *
 * THREE surfaces serve the same routes (the action-approvals precedent):
 *
 *  - `/v1/integrations/custom/definitions*` — the original top-level form, for
 *    the global Integrations page against a direct host.
 *  - `/v1/agents/:agentId/integrations/custom/definitions*` — the agent-scoped
 *    wrapper for direct API callers (ownership-checked here).
 *  - the per-agent dispatch `/agents/:agentId/integrations/custom/definitions*`
 *    — the ONE per-agent surface the hosted gateway proxies to a pod. The
 *    gateway mounts NO `/v1/integrations/custom/*` route (its integrations
 *    subtree is Composio-only), so a client fronted by it MUST call this form:
 *    the top-level POST 404ed at the gateway and broke the in-chat secure
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

const TOP =
  /^\/v1\/integrations\/custom\/definitions(?:\/([^/]+)(\/credential)?)?$/;
const AGENT =
  /^\/v1\/agents\/([^/]+)\/integrations\/custom\/definitions(?:\/([^/]+)(\/credential)?)?$/;
const DISPATCH =
  /^integrations\/custom\/definitions(?:\/([^/]+)(\/credential)?)?$/;

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
  slug: string | undefined,
  credential: boolean,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  try {
    if (!slug && method === "GET") {
      json(res, 200, { items: await manager.list() });
      return true;
    }
    if (slug && !credential && method === "DELETE") {
      await manager.remove(slug);
      json(res, 200, { ok: true });
      return true;
    }
    if (slug && credential && method === "POST") {
      const body = await readJson(req);
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
        await manager.setCredential(slug, values as Record<string, string>),
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
 *  `/v1/integrations/:provider/*` handler in server.ts (its catch-all would
 *  404 the `custom/definitions` subpaths). */
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
  if (!top && !scoped) return false;
  const manager = deps.customIntegrations;
  if (!manager) {
    json(res, 404, { error: "custom integrations not available here" });
    return true;
  }
  let slugRaw: string | undefined = top?.[1];
  let credential = !!top?.[2];
  if (scoped) {
    const authz = await authorize(
      deps.store,
      userId,
      decodeURIComponent(scoped[1] ?? ""),
    );
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    slugRaw = scoped[2];
    credential = !!scoped[3];
  }
  const slug = slugRaw ? decodeURIComponent(slugRaw) : undefined;
  return serve(manager, method, slug, credential, req, res);
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
  if (!m || !manager) return false;
  const slug = m[1] ? decodeURIComponent(m[1]) : undefined;
  return serve(manager, method, slug, !!m[2], req, res);
}
