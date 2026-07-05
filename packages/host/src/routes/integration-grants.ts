import type { IncomingMessage, ServerResponse } from "node:http";
import { canUseAgent } from "../domain/access";
import type { UserId } from "../domain/types";
import type { LocalIntegrationGrants } from "../integrations/grants";
import { normalizeToolkits } from "../integrations/grants";
import type { WorkspaceStore } from "../ports";
import { json, readJson } from "./http";

/**
 * Per-agent integration grants — LOCAL / self-host profile ONLY. Mounted only
 * when `deps.integrationGrants` is wired (see local/host.ts), which is never the
 * case on a managed cloud pod: the gateway in front owns grants there, so a pod
 * that also served them would shadow the authoritative policy. Absent dep → this
 * handler no-ops and the request 404s, which the client reads as "grants
 * unsupported" and degrades without a toast.
 *
 *   GET /v1/agents/:agentId/integration-grants  -> {toolkits}
 *   PUT  same {toolkits}                          -> {toolkits} (replace-set)
 */
export interface IntegrationGrantsDeps {
  store: WorkspaceStore;
  integrationGrants?: LocalIntegrationGrants;
}

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

export async function handleIntegrationGrants(
  deps: IntegrationGrantsDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(/^\/v1\/agents\/([^/]+)\/integration-grants$/);
  if (!match) return false;
  // Not wired (cloud pod / gateway-fronted) → fall through to a 404 so the
  // client degrades to "unsupported" rather than seeing a served route.
  if (!deps.integrationGrants) return false;
  if (method !== "GET" && method !== "PUT") return false;

  const agentId = match[1] ? decodeURIComponent(match[1]) : "";
  const authz = await authorize(deps.store, userId, agentId);
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }

  if (method === "GET") {
    json(res, 200, {
      toolkits: await deps.integrationGrants.read(agentId, userId),
    });
    return true;
  }

  const validation = normalizeToolkits((await readJson(req)).toolkits);
  if (!validation.ok) {
    json(res, 400, { error: validation.error });
    return true;
  }
  json(res, 200, {
    toolkits: await deps.integrationGrants.replace(
      agentId,
      validation.toolkits,
    ),
  });
  return true;
}
