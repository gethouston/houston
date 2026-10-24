import { z } from "zod";

const instant = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "expected an ISO date",
});

/**
 * Which way a yearly org's next adjustment goes: seats added are a `charge`
 * on the card, seats removed a `credit` Stripe spends on the invoices after
 * it (never a refund).
 */
export const ADJUSTMENT_KINDS = ["charge", "credit"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

/**
 * The next prorated true-up of a yearly seat subscription, on its org's
 * billing (`OrgBilling.nextAdjustment`). A yearly seat prorates every seat
 * change and Stripe bills the pending prorations once a month (or with the
 * renewal, when that comes first), at `at`. `amountCents` is always above
 * zero; `kind` says which way it goes. Set for the billing owner alone,
 * only while something is pending and `at` is ahead.
 */
export const nextAdjustmentSchema = z.object({
  kind: z.enum(ADJUSTMENT_KINDS),
  amountCents: z.number().int().positive(),
  at: instant,
});
export type NextAdjustment = z.infer<typeof nextAdjustmentSchema>;

/**
 * The `OrgBilling` field the next adjustment adds. An older gateway omits
 * it, and a shape this client cannot read (a kind a later gateway adds) must
 * not drop the whole billing state: both read as none.
 */
export const nextAdjustmentFields = {
  nextAdjustment: nextAdjustmentSchema.nullable().optional().catch(null),
};
