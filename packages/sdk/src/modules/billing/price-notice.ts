/**
 * The promo-ended notice: a billing owner still on the promotional monthly
 * seat price hears that it moves to the monthly list price at the next
 * charge, and either switches to yearly or keeps monthly. The two gateway
 * calls, and the rule for when the notice shows.
 */

import {
  type OrgBilling,
  parseOrgBilling,
  type SeatPrices,
  SWITCH_TO_YEARLY_REFUSALS,
  type SwitchToYearlyRefusal,
} from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";
import { refusalCode, refusalStatus } from "../refusal-code";

/** What a switch answered: the org's billing after it, or a state it is in. */
export type SwitchToYearlyResult =
  | { kind: "switched"; billing: OrgBilling | null }
  | { kind: SwitchToYearlyRefusal };

/** The refusal behind a failed switch, or null for every other error. */
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

/** What the promo-ended modal says, off the org's billing. */
export interface PromoEndedView {
  /** The promotional seat price the org pays today, a month. */
  previousCents: number;
  /** The monthly seat price from the next charge. */
  nextCents: number;
  /** The next charge, when the monthly price changes. */
  renewsAt: string;
  /** Every member is a seat; at least one. */
  seats: number;
  /** A new checkout's list prices: yearly is offered only where sold. */
  prices: SeatPrices | null;
}

/**
 * The promo-ended notice for the caller, or null: shown only to the billing
 * owner (the gateway sets it for them alone) of a paid org.
 */
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
    // The switch to yearly charges members plus pending invites.
    seats: Math.max(1, billing.seatsInUse ?? billing.seats),
    prices: billing.seatPrices,
  };
}

/**
 * Whether the promo-ended modal opens on its own: the notice is set, the
 * owner did not close it this session, and no other plan dialog (the
 * pricing-change modal first) is up. One modal at a time.
 */
export function promoEndedModalOpens(
  view: PromoEndedView | null,
  options: { closedThisSession: boolean; otherDialogOpen: boolean },
): boolean {
  return (
    view !== null && !options.closedThisSession && !options.otherDialogOpen
  );
}
