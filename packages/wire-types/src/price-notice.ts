import { z } from "zod";

const instant = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "expected an ISO date",
});
const cents = z.number().int().nonnegative();

export const priceNoticeSchema = z.object({
  kind: z.literal("promo_ended"),
  previousCents: cents,
  nextCents: cents,
  renewsAt: instant,
});
export type PriceNotice = z.infer<typeof priceNoticeSchema>;

export const priceNoticeFields = {
  renewsAt: instant.nullable().optional().catch(null),
  priceNotice: priceNoticeSchema.nullable().optional().catch(null),
};

export const SWITCH_TO_YEARLY_REFUSALS = {
  interval_unavailable: 409,
  already_yearly: 409,
  no_subscription: 409,
  switch_in_progress: 409,
  payment_failed: 402,
} as const;
export type SwitchToYearlyRefusal = keyof typeof SWITCH_TO_YEARLY_REFUSALS;
