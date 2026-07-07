import type { IncomingMessage, ServerResponse } from "node:http";
import { enrichAccounts } from "../integrations/account-enrich";
import {
  filterMatchesToGranted,
  grantedToolkits,
  resolveExecuteAccount,
  toolkitForAction,
} from "../integrations/grant-policy";
import type { LocalIntegrationGrants } from "../integrations/grants";
import { IntegrationSigninRequiredError } from "../integrations/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { bearer, header, json, readJson } from "./http";
import {
  type IntegrationDeps,
  relayIntegrationUpstreamError,
  signinRequired,
} from "./integrations";

/**
 * The RUNTIME-facing integrations proxy (`/sandbox/integrations/*`, authed by
 * the per-sandbox HMAC token): the agent's `integration_search` /
 * `integration_execute` tools call THIS, never the provider directly — no
 * integration secret ever sits in the agent runtime. The host resolves the
 * sandbox → its workspace owner → that user's id with the provider. The
 * user-facing routes live in integrations.ts.
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

  const body = await readJson(req);
  // Default to the only/first provider when the tool omits it (single-provider).
  const providerId =
    typeof body.provider === "string" ? body.provider : registry.ids()[0];
  if (!providerId || !registry.has(providerId)) {
    json(res, 404, {
      error: `unknown integration provider '${providerId ?? ""}'`,
    });
    return true;
  }
  const provider = registry.get(providerId);

  // The sandbox proves its workspace; the provider acts as the workspace owner.
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  if (!ws) {
    json(res, 404, { error: "workspace not found" });
    return true;
  }
  const userId = ws.ownerUserId;

  // WHO the runtime is acting as this turn (C2): the gateway-minted acting-as
  // token for a live user, OR the routine creator's sub for a fired routine.
  // Both absent locally (single-user) → the provider falls back to the owner.
  const actingAs = header(req, "x-houston-acting-as");
  const actingUser = header(req, "x-houston-acting-user");
  const acting = actingAs || actingUser ? { actingAs, actingUser } : undefined;

  // The grant set for THIS agent (the sandbox token binds its id). null ⇒ no
  // record ⇒ backward-compatible pass-through. Absent on gateway-fronted pods,
  // where the gateway already enforced upstream (and resolved the account).
  const granted = deps.integrationGrants
    ? await deps.integrationGrants.grantedOrNull(claim.agentId, userId)
    : null;
  const account =
    typeof body.account === "string" && body.account.length > 0
      ? body.account
      : undefined;

  try {
    if (m[1] === "search") {
      if (typeof body.query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return true;
      }
      const result = await provider.search(userId, body.query, acting);
      // No record (or gateway-fronted) → pass the adapter result through
      // verbatim, including any upstream-attached accounts.
      if (!granted) {
        json(res, 200, result);
        return true;
      }
      const toolkits = grantedToolkits(granted);
      json(res, 200, {
        items: filterMatchesToGranted(result.items, toolkits),
        accounts: await enrichAccounts(provider, userId, granted),
      });
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

    // No record (or gateway-fronted) → forward the account verbatim; the
    // upstream (or the direct adapter's single account) resolves it.
    if (!granted) {
      json(
        res,
        200,
        await provider.execute(userId, body.action, params, {
          acting,
          account,
        }),
      );
      return true;
    }

    // Enforced: the action's toolkit must be granted…
    const toolkit = toolkitForAction(body.action, grantedToolkits(granted));
    if (!toolkit) {
      json(res, 403, { error: "toolkit_not_granted" });
      return true;
    }
    // …then pin one of that toolkit's granted accounts.
    const forToolkit = granted.filter(
      (a) => a.toolkit.toLowerCase() === toolkit.toLowerCase(),
    );
    const resolution = resolveExecuteAccount(
      await enrichAccounts(provider, userId, forToolkit),
      account,
    );
    if (!resolution.ok) {
      if (resolution.error === "account_required") {
        json(res, 400, {
          error: "account_required",
          accounts: resolution.accounts,
        });
      } else {
        json(res, 403, { error: "account_not_granted" });
      }
      return true;
    }
    json(
      res,
      200,
      await provider.execute(userId, body.action, params, {
        acting,
        account: resolution.connectionId,
      }),
    );
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
