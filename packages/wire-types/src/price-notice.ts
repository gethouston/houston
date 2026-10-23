import { z } from "zod";

const instant = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "expected an ISO date",
});
const cents = z.number().int().nonnegative();

/**
 * A price change the billing owner has to hear about, on their org's billing
 * (`OrgBilling.priceNotice`). Only `promo_ended` exists: a live monthly
 * subscription still on the promotional seat price (`previousCents`) moves to
 * the monthly list price (`nextCents`) at its next charge (`renewsAt`). Set
 * for the billing owner alone; null once they dismissed it or switched to
 * yearly. A kind a later gateway adds reads as none.
 */
export const priceNoticeSchema = z.object({
  kind: z.literal("promo_ended"),
  previousCents: cents,
  nextCents: cents,
  renewsAt: instant,
});
export type PriceNotice = z.infer<typeof priceNoticeSchema>;

/** The `OrgBilling` fields the promo-ended notice adds; older gateways omit them. */
export const priceNoticeFields = {
  /** The live subscription's next charge; null without a live subscription. */
  renewsAt: instant.nullable().optional().catch(null),
  priceNotice: priceNoticeSchema.nullable().optional().catch(null),
};

/**
 * The refusals `POST /v1/org/billing/switch-to-yearly` answers for a state
 * the org is in, with their status: no yearly price is sold, the org is
 * already yearly, it has no live subscription, a switch is already under
 * way, or the card was declined (a declined card changes nothing).
 */
export const SWITCH_TO_YEARLY_REFUSALS = {
  interval_unavailable: 409,
  already_yearly: 409,
  no_subscription: 409,
  switch_in_progress: 409,
  payment_failed: 402,
} as const;
export type SwitchToYearlyRefusal = keyof typeof SWITCH_TO_YEARLY_REFUSALS;
