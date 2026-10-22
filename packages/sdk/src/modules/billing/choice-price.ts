import { formatPlanAmount } from "../plan/format";

/** One seat on any paid organization, before C3 sends the price per org. */
export const ORG_SEAT_PRICE_CENTS = 1500;
const CURRENCY = "usd";

/** One seat a month on a paid organization, formatted ("$15"). */
export function orgSeatPrice(locale?: string): string {
  return formatPlanAmount(ORG_SEAT_PRICE_CENTS, CURRENCY, locale);
}
