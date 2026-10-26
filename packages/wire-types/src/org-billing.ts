import { z } from "zod";
import { priceNoticeFields } from "./price-notice";
import { BILLING_INTERVALS, seatPricesSchema } from "./seat-prices";
import { seatCountFields } from "./seat-quote";
import type { OrgSummary, OrgsList } from "./types";

/**
 * The billing state every non-legacy org carries on `GET /v1/orgs`
 * (`OrgSummary.billing`), readable by every member, and the free slot on the
 * list (`OrgsList.freeOrg`). A `legacy` org, one the gateway has not moved to
 * org billing yet, sends no `billing`, and an older gateway sends the C8 team
 * summary in its place: both parse to `null`, so nothing reads per-person
 * state as an org's.
 */

export const LOCK_REASONS = [
  "unpaid",
  "canceled",
  "payment_failed",
  "migration",
] as const;
export type LockReason = (typeof LOCK_REASONS)[number];

const instant = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "expected an ISO date",
});
const count = z.number().int().nonnegative();

/** A free org's weekly pool, shared by every member. */
export const orgUsageSchema = z.object({
  scope: z.literal("org"),
  used: count,
  limit: count,
  resetsAt: instant,
});
export type OrgUsage = z.infer<typeof orgUsageSchema>;

/** A free org's routine rules: one active routine, a floor between fires. */
export const orgRoutinesSchema = z.object({
  paused: z.boolean(),
  kept: z.object({ agentSlug: z.string(), routineId: z.string() }).nullable(),
  needsChoice: z.boolean(),
  limitedCount: count,
  maxActive: z.number().int().positive(),
  minIntervalMinutes: z.number().int().positive(),
});
export type OrgRoutines = z.infer<typeof orgRoutinesSchema>;

const orgBillingWire = z.object({
  tier: z.enum(["free", "paid"]),
  status: z.enum(["active", "past_due", "locked"]),
  /** A future instant is a scheduled lock, a past one means locked. */
  lockAt: instant.nullable(),
  // A reason a later gateway adds must not drop the whole billing state.
  lockReason: z.enum(LOCK_REASONS).nullable().catch(null),
  /** The org holds its billing owner's one free slot. */
  freeSlot: z.boolean(),
  isBillingOwner: z.boolean(),
  seats: count,
  /**
   * How often the org's subscription bills; null with no subscription. A
   * gateway that predates intervals, or an interval it adds later, reads null.
   */
  interval: z.enum(BILLING_INTERVALS).nullable().catch(null),
  /**
   * One seat per `interval`, as this org is actually billed (a payer moved
   * from an older plan keeps that price). With no subscription, the monthly
   * list price. Null, with `interval`, while a live subscription's price has
   * not been read from Stripe yet: no figure to show.
   */
  seatPriceCents: count.nullable(),
  /**
   * A new checkout's list prices. An older gateway sends none, and a shape
   * this client cannot read must not drop the whole billing state: both read
   * as monthly only (see below).
   */
  seatPrices: seatPricesSchema.optional().catch(undefined),
  seatGraceEndsAt: instant.nullable(),
  usage: orgUsageSchema.nullable(),
  routines: orgRoutinesSchema.nullable(),
  ...priceNoticeFields,
  ...seatCountFields,
});

/**
 * A gateway that predates yearly seats sends no `seatPrices`; its
 * `seatPriceCents` is then the one monthly price it sells, and nothing is
 * sold yearly. With neither readable, a new checkout's prices are unknown
 * (null) and no surface names one.
 */
export const orgBillingSchema = orgBillingWire.transform(
  ({
    seatPrices,
    renewsAt,
    priceNotice,
    paidSeats,
    seatsInUse,
    ...billing
  }) => ({
    ...billing,
    renewsAt: renewsAt ?? null,
    priceNotice: priceNotice ?? null,
    paidSeats: paidSeats ?? null,
    seatsInUse: seatsInUse ?? null,
    seatPrices:
      seatPrices ??
      (billing.seatPriceCents === null
        ? null
        : { monthlyCents: billing.seatPriceCents, annualCents: null }),
  }),
);
export type OrgBilling = z.infer<typeof orgBillingSchema>;

/** Whether the caller can create a free org, and which org holds the slot. */
export const freeOrgSchema = z.object({
  available: z.boolean(),
  orgSlug: z.string().nullable(),
});
export type FreeOrg = z.infer<typeof freeOrgSchema>;

/** An org's billing as the wire sent it, or null for a legacy or older shape. */
export function parseOrgBilling(value: unknown): OrgBilling | null {
  const parsed = orgBillingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseFreeOrg(value: unknown): FreeOrg | null {
  const parsed = freeOrgSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** One org off the wire, with its billing parsed. */
export function readOrgSummary(raw: unknown): OrgSummary {
  const org = raw as OrgSummary & { billing?: unknown };
  return { ...org, billing: parseOrgBilling(org.billing) };
}

/** `GET /v1/orgs` off the wire, every org's billing and the free slot parsed. */
export function readOrgsList(raw: unknown): OrgsList {
  const list = raw as {
    orgs?: unknown[];
    invites?: OrgsList["invites"];
    freeOrg?: unknown;
  };
  return {
    orgs: (list.orgs ?? []).map(readOrgSummary),
    invites: list.invites ?? [],
    freeOrg: parseFreeOrg(list.freeOrg),
  };
}
