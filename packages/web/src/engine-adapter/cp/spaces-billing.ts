import type {
  AgentMoveStart,
  AgentMoveStatus,
  BillingCheckout,
  BillingSummary,
  OrgSummary,
  OrgsList,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The caller's spaces + pending invites. Degrades to an empty result on a
 * gateway that predates spaces (404) — the switcher then shows only the personal
 * workspace, byte-identical to a pre-C8 deployment. Every other error throws.
 */
export async function listOrgs(cfg: ControlPlaneConfig): Promise<OrgsList> {
  try {
    const res = await cpFetch(cfg, "/v1/orgs");
    return (await res.json()) as OrgsList;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) {
      return { orgs: [], invites: [] };
    }
    throw err;
  }
}

/**
 * Create a team space. NOT idempotent — on a lost response DON'T blind-retry;
 * reconcile via `listOrgs` and reuse the persisted slug (C8). Never degrades: a
 * failure throws so the UI surfaces the real reason.
 */
export async function createOrg(
  cfg: ControlPlaneConfig,
  name: string,
): Promise<OrgSummary> {
  const res = await cpFetch(cfg, "/v1/orgs", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as OrgSummary;
}

/**
 * Move an agent into a team space; returns the `moveId` to poll with
 * `getMoveStatus`. Never degrades — 403 `unsupported_move` / 409
 * `unmovable_volume` / 403 `needs_upgrade` throw so the caller surfaces them.
 */
export async function moveAgent(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  toSlug: string,
): Promise<AgentMoveStart> {
  const res = await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/move`,
    { method: "POST", body: JSON.stringify({ to: toSlug }) },
  );
  return (await res.json()) as AgentMoveStart;
}

/**
 * Poll one agent-move's progress (C8). The move-completion signal is THIS route
 * only — never the agent event stream (which relays pod-scoped events).
 */
export async function getMoveStatus(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  moveId: string,
): Promise<AgentMoveStatus> {
  const res = await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/move/${encodeURIComponent(moveId)}`,
  );
  return (await res.json()) as AgentMoveStatus;
}

/**
 * The active team's billing summary. Degrades to `null` for the NOT-ENTITLED
 * cases — a gateway that predates billing (404), a caller it refuses billing
 * detail (403 `personal_space` or plain member), and a billing-off deployment
 * (503 `billing not configured`: no `GW_STRIPE_*` set — every prod gateway with
 * no Stripe, and the kind loop, run this way) — so the billing UI renders
 * nothing and the degrade surfaces take over. Every other error throws. Mirrors
 * the engine-client shim's `getBilling` (same 404/403/503 status set), which is
 * what keeps the 503 from surfacing the red bug toast on team entry (HOU-904).
 */
export async function getBilling(
  cfg: ControlPlaneConfig,
): Promise<BillingSummary | null> {
  try {
    const res = await cpFetch(cfg, "/v1/org/billing");
    return (await res.json()) as BillingSummary;
  } catch (err) {
    if (
      err instanceof HoustonEngineError &&
      (err.status === 404 || err.status === 403 || err.status === 503)
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Start a Stripe Checkout session for the active team (owner only; admin gets
 * 403 `not_owner`). Returns the hosted `{url}`. Never degrades — a failure throws
 * so the UI surfaces the real reason.
 */
export async function createCheckout(
  cfg: ControlPlaneConfig,
  interval: "monthly" | "annual",
): Promise<BillingCheckout> {
  const res = await cpFetch(cfg, "/v1/org/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
  return (await res.json()) as BillingCheckout;
}

/**
 * Open the Stripe customer portal for the active team (owner only) — card,
 * invoices, interval switch, cancel. Returns the hosted `{url}`. Never degrades.
 */
export async function createPortal(
  cfg: ControlPlaneConfig,
): Promise<BillingCheckout> {
  const res = await cpFetch(cfg, "/v1/org/billing/portal", { method: "POST" });
  return (await res.json()) as BillingCheckout;
}
