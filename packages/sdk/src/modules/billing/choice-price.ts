import type { BillingChoice } from "@houston/wire-types";
import { formatPlanAmount } from "../plan/format";
import { formatCutoverDay } from "./choice-model";

/** One seat on any paid organization, before C3 sends the price per org. */
export const ORG_SEAT_PRICE_CENTS = 1500;
const CURRENCY = "usd";

export interface PayerTotals {
  /** What the subscription costs today. */
  today: string;
  /** When extra seats start to bill; null for a one-member org. */
  graceEndsOn: string | null;
  /** The monthly total once every member is billed. */
  monthly: string;
  /** One seat, for the "$15 each" line. */
  seat: string;
}

/** The price a payer sees for moving their subscription to `slug`. */
export function payerTotals(
  choice: BillingChoice,
  slug: string,
  locale?: string,
): PayerTotals | null {
  const org = choice.orgs.find((candidate) => candidate.slug === slug);
  if (!org) return null;
  const monthly =
    org.monthlyTotalCents ??
    ORG_SEAT_PRICE_CENTS * Math.max(1, org.memberCount);
  return {
    today: formatPlanAmount(ORG_SEAT_PRICE_CENTS, CURRENCY, locale),
    graceEndsOn: org.seatGraceEndsOn
      ? formatCutoverDay(org.seatGraceEndsOn, locale)
      : null,
    monthly: formatPlanAmount(monthly, CURRENCY, locale),
    seat: formatPlanAmount(ORG_SEAT_PRICE_CENTS, CURRENCY, locale),
  };
}
