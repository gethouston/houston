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
 * The interval a checkout surface preselects: yearly, as the website does.
 * Where no yearly seat is sold, `sellableInterval` turns it into monthly.
 */
export const DEFAULT_CHECKOUT_INTERVAL: BillingInterval = "year";

/**
 * The `interval` a checkout body carries: yearly by name, monthly as the
 * absent field (`JSON.stringify` drops `undefined`). Every gateway, an older
 * one included, reads an absent interval as monthly, and an older one refuses
 * a named "month"; yearly is only offered where the gateway sent a yearly
 * price.
 */
export function checkoutIntervalField(
  interval: BillingInterval | undefined,
): "year" | undefined {
  return interval === "year" ? "year" : undefined;
}

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

/**
 * What yearly saves against twelve monthly seats, as a whole percent ("25"),
 * from the wire's two prices; null where no yearly seat is sold or it saves
 * nothing.
 */
export function yearlySavingsPercent(prices: SeatPrices): number | null {
  if (prices.annualCents === null || prices.monthlyCents <= 0) return null;
  const percent = Math.round(
    (1 - prices.annualCents / 12 / prices.monthlyCents) * 100,
  );
  return percent > 0 ? percent : null;
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
  return (
    orgs?.orgs.find((org) => org.billing?.seatPrices)?.billing?.seatPrices ??
    null
  );
}

/**
 * The list prices the pricing-change announcement names: the orgs list's,
 * else the ones the billing choice carries for an account whose orgs carry
 * no billing yet; null when neither has any.
 */
export function announcedSeatPrices(
  orgs: OrgsList | undefined,
  choice: BillingChoice | undefined,
): SeatPrices | null {
  return listSeatPrices(orgs) ?? choice?.seatPrices ?? null;
}

/**
 * What an org's subscription bills, in Stripe minor units, per its
 * `interval`. Every member is a seat, and an org always bills at least one.
 * During a seat grace the subscription still bills one seat, so `today` is
 * that one seat until `graceEndsAt` and `total` is the bill after it; outside
 * a grace `today` is null. An org whose interval or seat price the wire does
 * not state (no subscription, a comp grant, an interval this client does not
 * know, a price not read from Stripe yet) is `unpriced`: no figure is shown
 * rather than a guessed one.
 */
export type OrgBillingPrice =
  | { kind: "unpriced" }
  | {
      kind: "priced";
      interval: BillingInterval;
      total: number;
      today: number | null;
      graceEndsAt: string | null;
    };

export function orgBillingPrice(
  billing: OrgBilling,
  now: number,
): OrgBillingPrice {
  const seatCents = billing.seatPriceCents;
  if (billing.interval === null || seatCents === null)
    return { kind: "unpriced" };
  const seats = Math.max(1, billing.seats);
  const grace =
    billing.tier === "paid" &&
    seats > 1 &&
    billing.seatGraceEndsAt !== null &&
    Date.parse(billing.seatGraceEndsAt) > now
      ? billing.seatGraceEndsAt
      : null;
  return {
    kind: "priced",
    interval: billing.interval,
    total: seats * seatCents,
    today: grace ? seatCents : null,
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
