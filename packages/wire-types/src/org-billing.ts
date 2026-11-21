import { z } from "zod";
import { priceNoticeFields } from "./price-notice";
import { BILLING_INTERVALS, seatPricesSchema } from "./seat-prices";
import { seatCountFields } from "./seat-quote";
import type { OrgSummary, OrgsList } from "./types";

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

export const orgUsageSchema = z.object({
  scope: z.literal("org"),
  used: count,
  limit: count,
  resetsAt: instant,
});
export type OrgUsage = z.infer<typeof orgUsageSchema>;

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
  lockAt: instant.nullable(),
  lockReason: z.enum(LOCK_REASONS).nullable().catch(null),
  freeSlot: z.boolean(),
  isBillingOwner: z.boolean(),
  seats: count,
  interval: z.enum(BILLING_INTERVALS).nullable().catch(null),
  seatPriceCents: count.nullable(),
  seatPrices: seatPricesSchema.optional().catch(undefined),
  seatGraceEndsAt: instant.nullable(),
  usage: orgUsageSchema.nullable(),
  routines: orgRoutinesSchema.nullable(),
  ...priceNoticeFields,
  ...seatCountFields,
});

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

export const freeOrgSchema = z.object({
  available: z.boolean(),
  orgSlug: z.string().nullable(),
});
export type FreeOrg = z.infer<typeof freeOrgSchema>;

export function parseOrgBilling(value: unknown): OrgBilling | null {
  const parsed = orgBillingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseFreeOrg(value: unknown): FreeOrg | null {
  const parsed = freeOrgSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readOrgSummary(raw: unknown): OrgSummary {
  const org = raw as OrgSummary & { billing?: unknown };
  return { ...org, billing: parseOrgBilling(org.billing) };
}

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
