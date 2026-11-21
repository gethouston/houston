import type {
  BillingChoice,
  BillingInterval,
  OrgBilling,
  OrgsList,
  SeatPrices,
} from "@houston/wire-types";

export const DEFAULT_CHECKOUT_INTERVAL: BillingInterval = "year";

export function checkoutIntervalField(
  interval: BillingInterval | undefined,
): "year" | undefined {
  return interval === "year" ? "year" : undefined;
}

export interface SeatPlan {
  interval: BillingInterval;
  seatCents: number;
  perMonthCents: number;
}

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

export function sellsYearly(prices: SeatPrices | null | undefined): boolean {
  return prices?.annualCents != null;
}

export function yearlySavingsPercent(prices: SeatPrices): number | null {
  if (prices.annualCents === null || prices.monthlyCents <= 0) return null;
  const percent = Math.round(
    (1 - prices.annualCents / 12 / prices.monthlyCents) * 100,
  );
  return percent > 0 ? percent : null;
}

export function sellableInterval(
  prices: SeatPrices,
  wanted: BillingInterval,
): BillingInterval {
  return seatPlans(prices).some((plan) => plan.interval === wanted)
    ? wanted
    : "month";
}

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

export function listSeatPrices(orgs: OrgsList | undefined): SeatPrices | null {
  return (
    orgs?.orgs.find((org) => org.billing?.seatPrices)?.billing?.seatPrices ??
    null
  );
}

export function announcedSeatPrices(
  orgs: OrgsList | undefined,
  choice: BillingChoice | undefined,
): SeatPrices | null {
  return listSeatPrices(orgs) ?? choice?.seatPrices ?? null;
}

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
  const seats =
    billing.paidSeats === null
      ? Math.max(1, billing.seats)
      : Math.max(1, billing.paidSeats, billing.seatsInUse ?? 0);
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

export function payerSeatCents(choice: BillingChoice): number | null {
  const priced = choice.orgs.find(
    (org) => org.monthlyTotalCents !== null && org.memberCount > 0,
  );
  if (!priced || priced.monthlyTotalCents === null) return null;
  return Math.round(priced.monthlyTotalCents / priced.memberCount);
}
