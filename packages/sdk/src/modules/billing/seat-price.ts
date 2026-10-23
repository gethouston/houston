import type {
  BillingChoice,
  BillingInterval,
  OrgBilling,
  OrgsList,
  SeatPrices,
} from "@houston/wire-types";

/**
 * What a seat costs and what an org pays, read off the wire's cents. The
 * gateway is the only source of a price: nothing here holds a figure, so a
 * price change, or a payer kept on an older price, reaches every surface and
 * the AI Manager untouched.
 */

/**
 * The interval a checkout preselects. Monthly: the first charge is the price
 * a person reads per month, and it is the one interval every deployment sells.
 */
export const DEFAULT_CHECKOUT_INTERVAL: BillingInterval = "month";

/** One way to pay for a seat at checkout. */
export interface SeatPlan {
  interval: BillingInterval;
  /** One seat for one `interval`. */
  seatCents: number;
  /** One seat for one month of it: a yearly seat spread over twelve. */
  perMonthCents: number;
}

/** The intervals a NEW checkout offers, monthly first. Yearly only where sold. */
export function seatPlans(prices: SeatPrices): SeatPlan[] {
  const monthly: SeatPlan = {
    interval: "month",
    seatCents: prices.monthlyCents,
    perMonthCents: prices.monthlyCents,
  };
  if (prices.annualCents === null) return [monthly];
  return [
    monthly,
    {
      interval: "year",
      seatCents: prices.annualCents,
      perMonthCents: Math.round(prices.annualCents / 12),
    },
  ];
}

/** Whether a checkout sells a yearly seat, so a surface offers the choice. */
export function sellsYearly(prices: SeatPrices | null | undefined): boolean {
  return prices?.annualCents != null;
}

/** The interval to start a checkout on: `wanted` when sold, else monthly. */
export function sellableInterval(
  prices: SeatPrices,
  wanted: BillingInterval,
): BillingInterval {
  return seatPlans(prices).some((plan) => plan.interval === wanted)
    ? wanted
    : "month";
}

/** A new checkout's bill for `seats` members, per `interval`. */
export function checkoutTotal(
  prices: SeatPrices,
  interval: BillingInterval,
  seats: number,
): number {
  const plan =
    seatPlans(prices).find((one) => one.interval === interval) ??
    seatPlans(prices)[0];
  return Math.max(1, seats) * plan.seatCents;
}

/** The list prices any org on the list carries, or null while none does. */
export function listSeatPrices(orgs: OrgsList | undefined): SeatPrices | null {
  return orgs?.orgs.find((org) => org.billing)?.billing?.seatPrices ?? null;
}

/**
 * The `interval` a checkout body carries: yearly by name, monthly as the
 * absent field (`JSON.stringify` drops `undefined`). Every gateway reads an
 * absent interval as monthly, so a monthly checkout never depends on the
 * gateway knowing intervals; yearly is only offered where it sent a yearly
 * price.
 */
export function checkoutIntervalField(
  interval: BillingInterval | undefined,
): "year" | undefined {
  return interval === "year" ? "year" : undefined;
}

/**
 * What an org's subscription bills, in Stripe minor units, per `interval`
 * (monthly while it has none). Every member is a seat, and an org always
 * bills at least one. During a seat grace the subscription still bills one
 * seat, so `today` is that one seat until `graceEndsAt` and `total` is the
 * bill after it; outside a grace `today` is null.
 */
export interface OrgBillingPrice {
  interval: BillingInterval;
  total: number;
  today: number | null;
  graceEndsAt: string | null;
}

export function orgBillingPrice(
  billing: OrgBilling,
  now: number,
): OrgBillingPrice {
  const seats = Math.max(1, billing.seats);
  const grace =
    billing.tier === "paid" &&
    seats > 1 &&
    billing.seatGraceEndsAt !== null &&
    Date.parse(billing.seatGraceEndsAt) > now
      ? billing.seatGraceEndsAt
      : null;
  return {
    interval: billing.interval ?? "month",
    total: seats * billing.seatPriceCents,
    today: grace ? billing.seatPriceCents : null,
    graceEndsAt: grace,
  };
}

/**
 * What a payer pays for one member a month today, from the pricing-change
 * pick's per-org monthly totals; null when no org carries one. A payer keeps
 * the price they signed up at.
 */
export function payerSeatCents(choice: BillingChoice): number | null {
  const priced = choice.orgs.find(
    (org) => org.monthlyTotalCents !== null && org.memberCount > 0,
  );
  if (!priced || priced.monthlyTotalCents === null) return null;
  return Math.round(priced.monthlyTotalCents / priced.memberCount);
}
