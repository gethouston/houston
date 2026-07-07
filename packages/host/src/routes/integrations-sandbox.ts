import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalIntegrationGrants } from "../integrations/grants";
import type { ActingContext } from "../integrations/provider";
import { IntegrationSigninRequiredError } from "../integrations/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { bearer, header, json, readJson } from "./http";
import {
  type IntegrationDeps,
  relayIntegrationUpstreamError,
  signinRequired,
} from "./integrations";
import {
  runSandboxExecute,
  runSandboxSearch,
  type SandboxOpCtx,
} from "./integrations-sandbox-ops";

/**
 * The RUNTIME-facing integrations proxy (`/sandbox/integrations/*`, authed by
 * the per-sandbox HMAC token): the agent's `integration_search` /
 * `integration_execute` tools call THIS, never the provider directly — no
 * integration secret ever sits in the agent runtime. The host resolves the
 * sandbox → its workspace owner → that user's id with the provider. Search fans
 * out over ALL wired providers (composio + custom + mcp) and execute routes by
 * the action name; the actual ops live in integrations-sandbox-ops.ts, the
 * user-facing routes in integrations.ts.
 */
export async function handleSandboxIntegrations(
  deps: {
    vault: CredentialVault;
    store: WorkspaceStore;
    integrations?: IntegrationDeps;
    /**
     * Per-agent grants (LOCAL / self-host only; absent on gateway-fronted pods,
     * where the gateway already enforced before the request reached here). When
     * the acting agent HAS a stored record, search is filtered to the granted
     * toolkits, execute of an ungranted toolkit is refused, and execute pins the
     * granted account for the toolkit (resolving any label the model passed).
     */
    integrationGrants?: LocalIntegrationGrants;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const m = path.match(/^\/sandbox\/integrations\/(search|execute)$/);
  if (!m || method !== "POST") return false;

  // Authenticate the sandbox (NOT a user JWT) — same gate as /sandbox/credential.
  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  if (!deps.integrations) {
    json(res, 503, { error: "integrations not configured" });
    return true;
  }
  const { registry } = deps.integrations;

  // The sandbox proves its workspace; the providers act as the workspace owner.
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  if (!ws) {
    json(res, 404, { error: "workspace not found" });
    return true;
  }
  const userId = ws.ownerUserId;

  // WHO the runtime is acting as this turn (C2): the gateway-minted acting-as
  // token for a live user, OR the routine creator's sub for a fired routine.
  // Both absent locally (single-user) → the providers fall back to the owner.
  const actingAs = header(req, "x-houston-acting-as");
  const actingUser = header(req, "x-houston-acting-user");
  const acting: ActingContext | undefined =
    actingAs || actingUser ? { actingAs, actingUser } : undefined;

  // The grant set for THIS agent (the sandbox token binds its id). null ⇒ no
  // record ⇒ backward-compatible pass-through. Absent on gateway-fronted pods,
  // where the gateway already enforced upstream (and resolved the account).
  const granted = deps.integrationGrants
    ? await deps.integrationGrants.grantedOrNull(claim.agentId, userId)
    : null;
  const body = await readJson(req);
  const account =
    typeof body.account === "string" && body.account.length > 0
      ? body.account
      : undefined;
  const ctx: SandboxOpCtx = { registry, granted, userId, acting, account };

  try {
    if (m[1] === "search") {
      if (typeof body.query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return true;
      }
      await runSandboxSearch(ctx, body.query, res);
      return true;
    }
    // execute
    if (typeof body.action !== "string") {
      json(res, 400, { error: "missing 'action'" });
      return true;
    }
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};
    await runSandboxExecute(ctx, body.action, params, res);
    return true;
  } catch (err) {
    if (err instanceof IntegrationSigninRequiredError) {
      signinRequired(res);
      return true;
    }
    if (relayIntegrationUpstreamError(res, err)) return true;
    throw err;
  }
}
