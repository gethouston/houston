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

/**
 * The refusals a seat checkout answers for the interval it asked for, with
 * their status: yearly where the deployment sells no yearly seat, or an
 * interval the gateway does not know.
 */
export const SEAT_INTERVAL_REFUSALS = {
  interval_unavailable: 409,
  invalid_interval: 400,
} as const;
export type SeatIntervalRefusal = keyof typeof SEAT_INTERVAL_REFUSALS;

/** What a seat checkout answered: its hosted page, or the interval refused. */
export type SeatCheckoutOutcome =
  | { kind: "checkout"; url: string }
  | { kind: SeatIntervalRefusal };

/**
 * The optional part of every body that starts a seat checkout (the org
 * checkout, a paid create, an unlock). Absent `interval` bills monthly; an
 * unknown one is a 400.
 */
export const seatCheckoutRequestSchema = z.object({
  interval: z.enum(BILLING_INTERVALS).optional(),
});
export type SeatCheckoutRequest = z.infer<typeof seatCheckoutRequestSchema>;
