import type {
  BillingChoice,
  OrgBilling,
  OrgRecoveryAction,
  OrgRole,
} from "@houston/wire-types";
import { canChangeChoice } from "./choice-model";

/** An org that is locked, past due, or has a lock scheduled. */
export function orgRecovering(billing: OrgBilling | null | undefined): boolean {
  return (
    billing !== null &&
    billing !== undefined &&
    (billing.status !== "active" || billing.lockAt !== null)
  );
}

/**
 * An org whose writes the gateway refuses (403 `needs_upgrade`), owner
 * included: sends, new agents, file and settings edits. Reading, moving
 * agents out, removing members and paying stay open.
 */
export function orgLocked(billing: OrgBilling | null | undefined): boolean {
  return billing?.status === "locked";
}

/**
 * Where an org stands, for a surface that names its state: working, a lock
 * scheduled (`lockAt` ahead, still active), a payment that failed (still
 * working until `lockAt`), or locked. A gateway that predates org billing
 * sends no billing and flags a locked team `degraded` only, so that reads as
 * locked too.
 */
export type OrgStanding = "ok" | "scheduled" | "past_due" | "locked";

export function orgStanding(
  billing: OrgBilling | null | undefined,
  degraded = false,
): OrgStanding {
  if (!billing) return degraded ? "locked" : "ok";
  if (billing.status === "locked") return "locked";
  if (billing.status === "past_due") return "past_due";
  return billing.lockAt !== null ? "scheduled" : "ok";
}

/**
 * Whether the owner may still change the pick the cutover applied: only an
 * owner with a pick to make ({@link canChangeChoice}), inside the window.
 */
function changeWindowOpen(choice: BillingChoice | null, now: number): boolean {
  return choice?.state === "applied" && canChangeChoice(choice, now);
}

/**
 * The actions a locked or locking org allows the caller, in the order a
 * surface offers them; empty for an org with nothing to recover from. Every
 * surface renders from this and decides nothing.
 *
 * Only the billing owner pays. A free tier, or a paid org locked for any reason
 * but a failed payment, has no live subscription: the way out is `checkout`,
 * or `claim_free` to make this the free org instead, or `delete`. A failed
 * payment, a past due org and a cancel at period end still hold their Stripe
 * subscription, so the way out is the `portal`. `change_pick` stays while the
 * cutover's change window is open. Owners and admins can `move_out` agents;
 * everyone who does not pay is told to `ask_owner`.
 */
export function orgRecovery(
  billing: OrgBilling | null | undefined,
  role: OrgRole,
  choice: BillingChoice | null,
  now = Date.now(),
): OrgRecoveryAction[] {
  if (!billing || !orgRecovering(billing)) return [];
  const actions: OrgRecoveryAction[] = [];
  const unpaid =
    billing.tier === "free" ||
    (billing.status === "locked" && billing.lockReason !== "payment_failed");
  if (billing.isBillingOwner) {
    actions.push(unpaid ? "checkout" : "portal");
    if (changeWindowOpen(choice, now)) actions.push("change_pick");
    if (unpaid) actions.push("claim_free", "delete");
  }
  if (role !== "user") actions.push("move_out");
  if (!billing.isBillingOwner) actions.push("ask_owner");
  return actions;
}
