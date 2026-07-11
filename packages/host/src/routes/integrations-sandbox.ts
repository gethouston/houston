import type { IncomingMessage, ServerResponse } from "node:http";
import { CUSTOM_ACTION_PREFIX } from "../integrations/custom/provider";
import {
  filterMatchesToGranted,
  isActionGranted,
  type LocalIntegrationGrants,
} from "../integrations/grants";
import type { IntegrationRegistry } from "../integrations/registry";
import { IntegrationSigninRequiredError } from "../integrations/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { bearer, header, json, readJson } from "./http";
import {
  type IntegrationDeps,
  relayIntegrationUpstreamError,
  signinRequired,
} from "./integrations";

/**
 * Which provider owns an action the runtime tool passed with no explicit
 * provider: executor addresses (`tools.<integration>....`) belong to the
 * custom provider when it is registered; everything else goes to the first
 * non-custom provider (Composio's slug convention), falling back to whatever
 * is registered.
 */
export function providerForAction(
  registry: IntegrationRegistry,
  action: string,
): string {
  const ids = registry.ids();
  if (action.startsWith(CUSTOM_ACTION_PREFIX) && ids.includes("custom")) {
    return "custom";
  }
  return ids.find((id) => id !== "custom") ?? ids[0] ?? "custom";
}

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
     * the acting agent HAS a stored record, search is filtered to granted
     * toolkits and execute of an ungranted toolkit is refused with 403.
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
    // A stable `code` marks THIS as the host's own not-configured signal (no
    // key in this install) — distinct from a transient upstream 503 the proxy
    // relays verbatim during an outage. The runtime tool classifies on the
    // code, never the bare status, so it never misdirects the user to set
    // COMPOSIO_API_KEY during a temporary gateway/provider failure.
    json(res, 503, {
      error: "integrations not configured",
      code: "integrations_not_configured",
    });
    return true;
  }
  const { registry } = deps.integrations;

  const body = await readJson(req);
  // An explicit provider narrows the call; omitted (the runtime tools always
  // omit it) means ALL providers: search fans out and merges, execute resolves
  // the owning provider from the action's shape (see providersFor/executorOf).
  if (typeof body.provider === "string" && !registry.has(body.provider)) {
    json(res, 404, {
      error: `unknown integration provider '${body.provider}'`,
    });
    return true;
  }
  const explicit = typeof body.provider === "string" ? body.provider : null;

  // The sandbox proves its workspace; the provider acts as the workspace owner.
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  if (!ws) {
    json(res, 404, { error: "workspace not found" });
    return true;
  }

  // WHO the runtime is acting as this turn (C2): the gateway-minted acting-as
  // token for a live user, OR the routine creator's sub for a fired routine.
  // Both absent locally (single-user) → the provider falls back to the owner.
  const actingAs = header(req, "x-houston-acting-as");
  const actingUser = header(req, "x-houston-acting-user");
  const acting = actingAs || actingUser ? { actingAs, actingUser } : undefined;

  // The grant set for THIS agent (the sandbox token binds its id). null ⇒ no
  // record ⇒ backward-compatible pass-through (every connected app). Absent on
  // gateway-fronted pods, where the gateway already enforced upstream.
  const granted = deps.integrationGrants
    ? await deps.integrationGrants.grantedOrNull(claim.agentId)
    : null;

  try {
    if (m[1] === "search") {
      const query = body.query;
      if (typeof query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return true;
      }
      const providerIds = explicit ? [explicit] : registry.ids();
      // Fan out and merge. One provider failing must not hide another's
      // results (desktop signed out: the gateway adapter throws while the
      // key-free custom provider still answers) — but an ALL-empty merge with
      // a signin failure underneath must still surface THAT, or the runtime
      // would render the wrong speech act ("no such app" instead of the
      // sign-in card).
      const settled = await Promise.allSettled(
        providerIds.map((id) =>
          registry.get(id).search(ws.ownerUserId, query, acting),
        ),
      );
      const items = settled.flatMap((s) =>
        s.status === "fulfilled" ? s.value : [],
      );
      const failures = settled.flatMap((s) =>
        s.status === "rejected" ? [s.reason] : [],
      );
      if (items.length === 0 && failures.length > 0) {
        throw (
          failures.find((f) => f instanceof IntegrationSigninRequiredError) ??
          failures[0]
        );
      }
      json(res, 200, {
        items: granted ? filterMatchesToGranted(items, granted) : items,
      });
      return true;
    }

    // execute
    const action = body.action;
    if (typeof action !== "string") {
      json(res, 400, { error: "missing 'action'" });
      return true;
    }
    // Grant check before the upstream call — an ungranted toolkit never runs.
    if (granted && !isActionGranted(action, granted)) {
      json(res, 403, { error: "toolkit_not_granted" });
      return true;
    }
    const provider = registry.get(
      explicit ?? providerForAction(registry, action),
    );
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};
    json(
      res,
      200,
      await provider.execute(ws.ownerUserId, action, params, acting),
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
