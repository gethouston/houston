import { z } from "zod";

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const seatPricesSchema = z.object({
  monthlyCents: z.number().int().nonnegative(),
  annualCents: z.number().int().nonnegative().nullable(),
});
export type SeatPrices = z.infer<typeof seatPricesSchema>;

export const SEAT_INTERVAL_REFUSALS = {
  interval_unavailable: 409,
  invalid_interval: 400,
} as const;
export type SeatIntervalRefusal = keyof typeof SEAT_INTERVAL_REFUSALS;

export type SeatCheckoutOutcome =
  | { kind: "checkout"; url: string }
  | { kind: SeatIntervalRefusal };

export const seatCheckoutRequestSchema = z.object({
  interval: z.enum(BILLING_INTERVALS).optional(),
});
export type SeatCheckoutRequest = z.infer<typeof seatCheckoutRequestSchema>;
