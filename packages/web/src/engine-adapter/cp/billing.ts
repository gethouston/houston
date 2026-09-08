import type {
  BillingCheckout,
  BillingSummary,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The active team's Stripe subscription (`/v1/org/billing/*`): its summary plus
 * the two hosted-page handoffs (Checkout, customer portal). The spaces the
 * subscription belongs to live in `spaces.ts`.
 */

/**
 * Shows the plan, trial, and payment status of the team workspace.
 *
 * The active team's billing summary. Degrades to `null` for the NOT-ENTITLED
 * cases — a gateway that predates billing (404), a caller it refuses billing
 * detail (403 `personal_space` or plain member), and a billing-off deployment
 * (503 `billing not configured`: no `GW_STRIPE_*` set — every prod gateway with
 * no Stripe, and the kind loop, run this way) — so the billing UI renders
 * nothing and the degrade surfaces take over. Every other error throws. Mirrors
 * the engine-client shim's `getBilling` (same 404/403/503 status set), which is
 * what keeps the 503 from surfacing the red bug toast on team entry (HOU-904).
 * @assistant group:billing
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
 * Starts the checkout that subscribes the team workspace to a paid plan.
 *
 * Start a Stripe Checkout session for the active team (owner only; admin gets
 * 403 `not_owner`). Returns the hosted `{url}`. Never degrades — a failure throws
 * so the UI surfaces the real reason.
 * @assistant group:billing confirm
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
 * Opens the billing page where the user can change the card, see invoices, or cancel.
 *
 * Open the Stripe customer portal for the active team (owner only) — card,
 * invoices, interval switch, cancel. Returns the hosted `{url}`. Never degrades.
 *
 * Not confirmed: it opens a page. Nothing is charged or changed until the user
 * acts inside Stripe's own portal, which asks for its own confirmation.
 * @assistant group:billing
 */
export async function createPortal(
  cfg: ControlPlaneConfig,
): Promise<BillingCheckout> {
  const res = await cpFetch(cfg, "/v1/org/billing/portal", { method: "POST" });
  return (await res.json()) as BillingCheckout;
}
