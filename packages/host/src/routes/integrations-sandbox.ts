import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalActionApprovals } from "../integrations/action-approvals";
import { isReadOnlyAction } from "../integrations/action-classification";
import { displayParams, hashActionParams } from "../integrations/approvals";
import { CUSTOM_ACTION_PREFIX } from "../integrations/custom/provider";
import type { IntegrationProvider } from "../integrations/provider";
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
     * Per-agent action-approval policy (LOCAL / self-host + managed pods). When
     * present, execute is gated on user approval unless the turn runs in
     * Autopilot (auto header) — see the gate below. Absent → no gate (existing
     * installs/tests execute untouched).
     */
    actionApprovals?: LocalActionApprovals;
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
      json(res, 200, { items });
      return true;
    }

    // execute
    const action = body.action;
    if (typeof action !== "string") {
      json(res, 400, { error: "missing 'action'" });
      return true;
    }
    const provider = registry.get(
      explicit ?? providerForAction(registry, action),
    );
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};

    // Action-approval gate. Precedence: (0) a READ-ONLY action runs ungated —
    // a read never needs supervision, classified from the slug's verb segments
    // (isReadOnlyAction, conservative: ambiguous = not read-only); (1) an
    // Autopilot turn auto-approves — the runtime stamps x-houston-turn-mode:auto
    // and the sandbox HMAC already authenticated the runtime, so the header is
    // trusted; (2) an always-allow record for THIS action runs; (3) a fresh
    // one-shot ticket matching hash(action, params) is consumed (single use)
    // and runs; else (4) 409 approval_required with a display payload the
    // runtime turns into an approval step on the interaction card. Skipped
    // wholesale when the policy is unwired (deps.actionApprovals absent →
    // existing installs unchanged).
    const approvals = deps.actionApprovals;
    if (
      approvals &&
      !isReadOnlyAction(action) &&
      header(req, "x-houston-turn-mode") !== "auto"
    ) {
      if (!(await approvals.isAlways(claim.agentId, action))) {
        const hash = hashActionParams(action, params);
        if (!(await approvals.consumeTicket(claim.agentId, hash))) {
          const display = displayParams(params);
          json(res, 409, {
            error: "approval required",
            code: "approval_required",
            approval: {
              toolkit: await resolveToolkit(action, provider, ws.ownerUserId),
              action,
              params: display.params,
              paramsHash: hash,
              // The user approves the full call; when the card caps its param
              // rows, tell it how many settings it isn't showing so it can say so
              // (present only when > 0 — omitted from the common no-cap case).
              ...(display.omitted > 0
                ? { paramsOmitted: display.omitted }
                : {}),
            },
          });
          return true;
        }
      }
    }

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

/**
 * Does `action` belong to `toolkit`? Composio slugs are `<TOOLKIT>_<REST>` with
 * the toolkit uppercased VERBATIM, so a multi-word slug keeps its underscores
 * (`google_maps` → `GOOGLE_MAPS_GET_ROUTE`); match the FULL slug as a prefix up
 * to an underscore boundary, never the segment before the first `_`. Custom
 * actions are executor addresses (`tools.<integration>.…`): the toolkit is the
 * integration segment, matched exactly.
 */
function actionInToolkit(action: string, toolkit: string): boolean {
  const a = action.toLowerCase();
  const t = toolkit.toLowerCase();
  if (a.startsWith("tools.")) return a.split(".")[1] === t;
  return a === t || a.startsWith(`${t}_`);
}

/** Longest slug in `slugs` whose full-prefix matches `action` (so a multi-word
 *  `google_maps` wins over a shorter `google` that also prefixes the action), or
 *  null when none matches. */
function longestMatchingSlug(action: string, slugs: string[]): string | null {
  let best: string | null = null;
  for (const slug of slugs) {
    if (actionInToolkit(action, slug) && (!best || slug.length > best.length))
      best = slug;
  }
  return best;
}

/**
 * Best-effort toolkit slug for the approval card (execute carries only the
 * action slug). Resolution, in order:
 *   1. The LONGEST matching slug among the acting user's CONNECTIONS, so a
 *      multi-word slug like `google_maps` is labeled correctly instead of the
 *      segment before the first underscore (`google`). Fault-tolerant: a
 *      `listConnections` failure falls through — the 409 must never fail on this
 *      display-only lookup.
 *   2. The segment before the first underscore, lowercased — the last-resort
 *      fallback (lossy for multi-word slugs). Only the paramsHash + action gate
 *      the call; the toolkit label is display-only.
 * Runs ONLY on the 409 path, never on the happy path.
 */
async function resolveToolkit(
  action: string,
  provider: IntegrationProvider,
  userId: string,
): Promise<string> {
  try {
    const connected = (await provider.listConnections(userId)).map(
      (c) => c.toolkit,
    );
    const best = longestMatchingSlug(action, connected);
    if (best) return best;
  } catch {
    // Display-only lookup — never let it fail the 409; fall through.
  }
  return action.split("_")[0]?.toLowerCase() ?? "";
}
