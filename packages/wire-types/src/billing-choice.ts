import { z } from "zod";

/**
 * The free-org pick an owner makes before plans move to organizations
 * (`/v1/me/billing-choice*`, gateway only, account-scoped: the gateway ignores
 * `x-houston-org` and the client never sends it).
 *
 *  - `GET /v1/me/billing-choice` answers {@link BillingChoice}. A gateway that
 *    predates the program, or has retired it, answers 404.
 *  - `PUT /v1/me/billing-choice` takes {@link BillingChoicePick} and answers
 *    the GET shape. Refusals are {@link BILLING_CHOICE_REFUSALS}.
 *  - `POST /v1/me/billing-choice/dismiss` answers 204.
 *
 * A refusal body is `{"code": "<code>", "error": "<message>"}`.
 */

export const BILLING_CHOICE_PAYERS = ["plus", "comp", "sponsored"] as const;
export type BillingChoicePayer = (typeof BILLING_CHOICE_PAYERS)[number];

/** Each refusal a pick answers for a state the person is in, with its status. */
export const BILLING_CHOICE_REFUSALS = {
  not_owner: 409,
  not_payer: 409,
  same_org: 400,
  /** After the cutover: the change window closed, so the applied pick stays. */
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
  /** Set for a payer only: $15 times the members. */
  monthlyTotalCents: z.number().int().nonnegative().nullable(),
  /** Set for a payer only, when the org has more than one member. */
  seatGraceEndsOn: instant.nullable(),
  lockAt: instant.nullable(),
});
export type BillingChoiceOrg = z.infer<typeof billingChoiceOrgSchema>;

export const billingChoiceSchema = z.object({
  /** True when the caller owns more than one org. */
  needed: z.boolean(),
  // A value a later gateway adds must not break a shipped client: an unknown
  // payer reads as none, an unknown state as applied (nothing left to pick).
  payer: z.enum(BILLING_CHOICE_PAYERS).nullable().catch(null),
  state: z.enum(["pending", "applied"]).catch("applied"),
  provisional: z.boolean(),
  cutoverAt: instant,
  changeableUntil: instant.nullable(),
  noticeDismissed: z.boolean(),
  freeOrgSlug: z.string().nullable(),
  paidOrgSlug: z.string().nullable(),
  /** Every org the caller owns. Empty for an account that owns none. */
  orgs: z.array(billingChoiceOrgSchema),
});
export type BillingChoice = z.infer<typeof billingChoiceSchema>;

/** The body of `PUT /v1/me/billing-choice`. */
export interface BillingChoicePick {
  freeOrgSlug: string;
  /** Plus and comp payers only: the org their subscription pays for. */
  paidOrgSlug?: string;
}
