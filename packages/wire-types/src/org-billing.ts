import { z } from "zod";
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

export const orgBillingSchema = z.object({
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
  seatPriceCents: count,
  seatGraceEndsAt: instant.nullable(),
  usage: orgUsageSchema.nullable(),
  routines: orgRoutinesSchema.nullable(),
});
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

/** The plan `POST /v1/orgs` asks for. Every new client sends one. */
export const ORG_PLANS = ["free", "paid"] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

/** The 409 a free create answers while the caller's free slot is taken. */
export const FREE_ORG_TAKEN = "free_org_taken";

/**
 * What a create answered: the org, the free slot already held by another org
 * (nothing was created), or a paid org that stays locked until its checkout
 * completes. A paid create's 201 is the org summary with `checkoutUrl` beside
 * it, which an older client reads as a plain summary.
 */
export type CreateOrgOutcome =
  | { kind: "created"; org: OrgSummary }
  | { kind: typeof FREE_ORG_TAKEN; freeOrgSlug: string }
  | { kind: "checkout"; org: OrgSummary; checkoutUrl: string };

/** Read a 201 from `POST /v1/orgs`. */
export function readCreatedOrg(raw: unknown): CreateOrgOutcome {
  const { checkoutUrl, ...org } = raw as { checkoutUrl?: unknown };
  const summary = readOrgSummary(org);
  return typeof checkoutUrl === "string" && checkoutUrl.length > 0
    ? { kind: "checkout", org: summary, checkoutUrl }
    : { kind: "created", org: summary };
}

/**
 * The refusals `POST /v1/org/billing/free` (the free-slot swap) answers for a
 * state the caller is in, with their status: the org still has a live
 * subscription, or the caller is not the one who pays.
 */
export const CLAIM_FREE_REFUSALS = {
  has_subscription: 409,
  not_billing_owner: 403,
} as const;
export type ClaimFreeRefusal = keyof typeof CLAIM_FREE_REFUSALS;

/** What a locked or locking org lets the caller do about it. */
export const ORG_RECOVERY_ACTIONS = [
  "checkout",
  "portal",
  "change_pick",
  "claim_free",
  "delete",
  "move_out",
  "ask_owner",
] as const;
export type OrgRecoveryAction = (typeof ORG_RECOVERY_ACTIONS)[number];
