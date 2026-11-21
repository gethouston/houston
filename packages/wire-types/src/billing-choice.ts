import { z } from "zod";
import { seatPricesSchema } from "./seat-prices";

export const BILLING_CHOICE_PAYERS = ["plus", "comp", "sponsored"] as const;
export type BillingChoicePayer = (typeof BILLING_CHOICE_PAYERS)[number];

export const BILLING_CHOICE_REFUSALS = {
  not_owner: 409,
  not_payer: 409,
  same_org: 400,
  choice_closed: 409,
} as const;
export type BillingChoiceRefusal = keyof typeof BILLING_CHOICE_REFUSALS;

const instant = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "expected an ISO date",
});

export const billingChoiceOrgSchema = z.object({
  slug: z.string().min(1),
  name: z.string(),
  personal: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  messages30d: z.number().int().nonnegative(),
  lastActiveOn: instant.nullable(),
  monthlyTotalCents: z.number().int().nonnegative().nullable(),
  seatGraceEndsOn: instant.nullable(),
  lockAt: instant.nullable(),
});
export type BillingChoiceOrg = z.infer<typeof billingChoiceOrgSchema>;

export const billingChoiceSchema = z.object({
  needed: z.boolean(),
  payer: z.enum(BILLING_CHOICE_PAYERS).nullable().catch(null),
  state: z.enum(["pending", "applied"]).catch("applied"),
  provisional: z.boolean(),
  cutoverAt: instant,
  changeableUntil: instant.nullable(),
  noticeDismissed: z.boolean(),
  freeOrgSlug: z.string().nullable(),
  paidOrgSlug: z.string().nullable(),
  orgs: z.array(billingChoiceOrgSchema),
  seatPrices: seatPricesSchema.nullable().optional().catch(null),
});
export type BillingChoice = z.infer<typeof billingChoiceSchema>;

export interface BillingChoicePick {
  freeOrgSlug: string;
  paidOrgSlug?: string;
}
