import { z } from "zod";

/**
 * How often a seat subscription bills. `month` bills the monthly seat price,
 * `year` the annual one (one payment for twelve months).
 */
export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/**
 * The list prices of a NEW seat checkout, per seat: a month on the monthly
 * price, a year on the annual one. `annualCents` is null where the deployment
 * sells no yearly seat, and a checkout asking for one is refused.
 */
export const seatPricesSchema = z.object({
  monthlyCents: z.number().int().nonnegative(),
  annualCents: z.number().int().nonnegative().nullable(),
});
export type SeatPrices = z.infer<typeof seatPricesSchema>;

/** The 409 a yearly checkout answers where the deployment sells no yearly seat. */
export const INTERVAL_UNAVAILABLE = "interval_unavailable";

/**
 * The optional part of every body that starts a seat checkout (the org
 * checkout, a paid create, an unlock). Absent `interval` bills monthly; an
 * unknown one is a 400.
 */
export const seatCheckoutRequestSchema = z.object({
  interval: z.enum(BILLING_INTERVALS).optional(),
});
export type SeatCheckoutRequest = z.infer<typeof seatCheckoutRequestSchema>;
