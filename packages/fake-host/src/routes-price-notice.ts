/**
 * The promo-ended notice's two gateway answers, for the active org's billing
 * owner: `POST /v1/org/billing/switch-to-yearly` (the org's billing after the
 * switch, or 409 `interval_unavailable` / `already_yearly`, 402
 * `payment_failed`) and `POST /v1/org/billing/price-notice/dismiss` (204).
 * A spec makes the next switch decline with `/__test__/switch-yearly`. Every
 * call lands in the plan ledger.
 */

import { json, noContent } from "./http";
import * as state from "./state";

const YEAR_MS = 365 * 24 * 3_600_000;

let declineNextSwitch = false;

/** `{ decline: true }`: the next switch answers 402 `payment_failed`. */
export function setSwitchDeclines(decline: boolean): void {
  declineNextSwitch = decline;
}

const refuse = (status: number, code: string, error: string): Response =>
  json({ error, code }, status);

/** Route a price-notice call, or return `undefined` to fall through. */
export function handlePriceNoticeRoutes(
  method: string,
  segs: string[],
  req: Request,
): Response | undefined {
  if (method !== "POST" || segs.slice(0, 3).join("/") !== "v1/org/billing")
    return undefined;
  const action = segs.slice(3).join("/");
  if (action !== "switch-to-yearly" && action !== "price-notice/dismiss")
    return undefined;
  const slug = state.requestOrgSlug(req);
  const billing = state.orgBillingOf(slug);
  if (action === "price-notice/dismiss") {
    state.recordPlanCall("price_notice_dismiss", { orgSlug: slug });
    if (!billing?.isBillingOwner)
      return refuse(403, "not_billing_owner", "only the billing owner");
    state.setOrgBilling(slug, { ...billing, priceNotice: null });
    return noContent();
  }
  state.recordPlanCall("switch_to_yearly", { orgSlug: slug });
  if (!billing?.isBillingOwner)
    return refuse(403, "not_billing_owner", "only the billing owner");
  const annual = billing.seatPrices?.annualCents ?? null;
  if (annual === null || !state.sellsYearlySeat())
    return refuse(409, "interval_unavailable", "yearly billing is off");
  if (billing.interval === "year")
    return refuse(409, "already_yearly", "already billed yearly");
  if (declineNextSwitch) {
    declineNextSwitch = false;
    return refuse(402, "payment_failed", "card declined");
  }
  const next = {
    ...billing,
    interval: "year" as const,
    seatPriceCents: annual,
    renewsAt: new Date(Date.now() + YEAR_MS).toISOString(),
    priceNotice: null,
    nextAdjustment: null,
  };
  state.setOrgBilling(slug, next);
  return json({ billing: next });
}
