import {
  type OrgBilling,
  parseOrgBilling,
  type SeatPrices,
  SWITCH_TO_YEARLY_REFUSALS,
  type SwitchToYearlyRefusal,
} from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";
import { refusalCode, refusalStatus } from "../refusal-code";

export type SwitchToYearlyResult =
  | { kind: "switched"; billing: OrgBilling | null }
  | { kind: SwitchToYearlyRefusal };

export function switchToYearlyRefusal(
  error: unknown,
): SwitchToYearlyRefusal | null {
  if (!(error instanceof Error)) return null;
  const code = refusalCode(error);
  if (code === null || !Object.hasOwn(SWITCH_TO_YEARLY_REFUSALS, code))
    return null;
  const refusal = code as SwitchToYearlyRefusal;
  return SWITCH_TO_YEARLY_REFUSALS[refusal] === refusalStatus(error)
    ? refusal
    : null;
}

/**
 * Moves the organization's monthly subscription to yearly billing.
 *
 * Billing owner only. Swaps the live monthly seat subscription to the yearly
 * price and charges the card on file; a declined card changes nothing.
 * Answers the org's billing after the switch as `switched`, or the state the
 * org is in: `interval_unavailable` (no yearly seat is sold here),
 * `already_yearly`, `no_subscription`, `switch_in_progress` (one is already
 * under way), or `payment_failed` (the card was declined). Every other
 * failure throws.
 * @assistant group:billing
 * @assistant confirm: money. It charges the card on file for a year of seats.
 */
export async function switchToYearly(
  scope: HttpScope,
): Promise<SwitchToYearlyResult> {
  try {
    const res = await httpRequest(scope, "/v1/org/billing/switch-to-yearly", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as { billing?: unknown };
    return { kind: "switched", billing: parseOrgBilling(body.billing) };
  } catch (err) {
    const refusal = switchToYearlyRefusal(err);
    if (refusal) return { kind: refusal };
    throw err;
  }
}

/**
 * Hides the notice that the organization's promotional price is ending.
 *
 * Billing owner only. Stores, for the active org, that the owner read the
 * promo-ended notice and keeps monthly billing, so no device shows it again.
 * @assistant group:billing
 * @assistant unconfirmed: it only hides a notice; billing stays exactly as it is.
 */
export async function dismissPriceNotice(scope: HttpScope): Promise<void> {
  await httpRequest(scope, "/v1/org/billing/price-notice/dismiss", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface PromoEndedView {
  previousCents: number;
  nextCents: number;
  renewsAt: string;
  seats: number;
  prices: SeatPrices | null;
}

export function promoEndedView(
  billing: OrgBilling | null | undefined,
): PromoEndedView | null {
  const notice = billing?.priceNotice;
  if (!billing?.isBillingOwner || billing.tier !== "paid") return null;
  if (notice?.kind !== "promo_ended") return null;
  return {
    previousCents: notice.previousCents,
    nextCents: notice.nextCents,
    renewsAt: notice.renewsAt,
    seats: Math.max(1, billing.seatsInUse ?? billing.seats),
    prices: billing.seatPrices,
  };
}

export function promoEndedModalOpens(
  view: PromoEndedView | null,
  options: { closedThisSession: boolean; otherDialogOpen: boolean },
): boolean {
  return (
    view !== null && !options.closedThisSession && !options.otherDialogOpen
  );
}
