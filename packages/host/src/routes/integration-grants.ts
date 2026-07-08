import type { IncomingMessage, ServerResponse } from "node:http";
import { canUseAgent } from "../domain/access";
import type { UserId } from "../domain/types";
import { normalizeAccountIds } from "../integrations/grant-policy";
import type { GrantAccount } from "../integrations/grant-store";
import type { LocalIntegrationGrants } from "../integrations/grants";
import { IntegrationSigninRequiredError } from "../integrations/types";
import type { WorkspaceStore } from "../ports";
import { json, readJson } from "./http";
import { type IntegrationDeps, signinRequired } from "./integrations";

/**
 * Per-agent integration grants — LOCAL / self-host profile ONLY. Mounted only
 * when `deps.integrationGrants` is wired (see local/host.ts), which is never the
 * case on a managed cloud pod: the gateway in front owns grants there, so a pod
 * that also served them would shadow the authoritative policy. Absent dep → this
 * handler no-ops and the request 404s, which the client reads as "grants
 * unsupported" and degrades without a toast.
 *
 * The grant unit is a connected ACCOUNT: the wire carries `connectionId`s. A PUT
 * validates every id against the user's live connections (unknown → 400) and
 * captures each id's toolkit server-side.
 *
 *   GET /v1/agents/:agentId/integration-grants  -> {accounts: connectionId[]}
 *   PUT  same {accounts: connectionId[]}          -> {accounts} (replace-set)
 */
export interface IntegrationGrantsDeps {
  store: WorkspaceStore;
  integrations?: IntegrationDeps;
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

/** Map each of the user's live connections to its toolkit, across all providers. */
async function connectionToolkits(
  integrations: IntegrationDeps | undefined,
  userId: UserId,
): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  if (!integrations) return byId;
  for (const id of integrations.registry.ids()) {
    const provider = integrations.registry.get(id);
    for (const c of await provider.listConnections(userId)) {
      byId.set(c.connectionId, c.toolkit);
    }
  }
  return byId;
}

async function handlePut(
  deps: IntegrationGrantsDeps,
  grants: LocalIntegrationGrants,
  userId: UserId,
  agentId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const validation = normalizeAccountIds((await readJson(req)).accounts);
  if (!validation.ok) {
    json(res, 400, { error: validation.error });
    return;
  }
  // Every id must be one of the user's live connections — capture its toolkit
  // server-side rather than trusting the client for it.
  const toolkits = await connectionToolkits(deps.integrations, userId);
  const accounts: GrantAccount[] = [];
  for (const connectionId of validation.ids) {
    const toolkit = toolkits.get(connectionId);
    if (!toolkit) {
      json(res, 400, { error: "invalid_accounts" });
      return;
    }
    accounts.push({ connectionId, toolkit });
  }
  const stored = await grants.replace(agentId, accounts);
  json(res, 200, { accounts: stored.map((a) => a.connectionId) });
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

  try {
    if (method === "GET") {
      const accounts = await deps.integrationGrants.read(agentId, userId);
      json(res, 200, { accounts: accounts.map((a) => a.connectionId) });
      return true;
    }
    await handlePut(deps, deps.integrationGrants, userId, agentId, req, res);
    return true;
  } catch (err) {
    if (err instanceof IntegrationSigninRequiredError) {
      signinRequired(res);
      return true;
    }
    throw err;
  }
}
