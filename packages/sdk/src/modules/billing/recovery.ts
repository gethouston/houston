import type {
  BillingChoice,
  OrgBilling,
  OrgRecoveryAction,
  OrgRole,
} from "@houston/wire-types";

/** An org that is locked, past due, or has a lock scheduled. */
export function orgRecovering(billing: OrgBilling | null | undefined): boolean {
  return (
    billing !== null &&
    billing !== undefined &&
    (billing.status !== "active" || billing.lockAt !== null)
  );
}

/** Whether the owner may still change the pick the cutover applied. */
function changeWindowOpen(choice: BillingChoice | null, now: number): boolean {
  if (choice?.state !== "applied" || !choice.changeableUntil) return false;
  return Date.parse(choice.changeableUntil) > now;
}

/**
 * The actions a locked or locking org allows the caller, in the order a
 * surface offers them; empty for an org with nothing to recover from. Every
 * surface renders from this and decides nothing.
 *
 * Only the billing owner pays. With no live subscription (a free tier: an
 * unpaid, canceled or migration lock) the way out is `checkout`, or `claim_free`
 * to make this the free org instead, or `delete`. A paid tier still has its
 * subscription (past due, a failed payment, a cancel at period end), so the
 * way out is the Stripe `portal`. `change_pick` stays while the cutover's
 * change window is open. Owners and admins can `move_out` agents; everyone
 * who does not pay is told to `ask_owner`.
 */
export function orgRecovery(
  billing: OrgBilling | null | undefined,
  role: OrgRole,
  choice: BillingChoice | null,
  now = Date.now(),
): OrgRecoveryAction[] {
  if (!billing || !orgRecovering(billing)) return [];
  const actions: OrgRecoveryAction[] = [];
  const unpaid = billing.tier === "free";
  if (billing.isBillingOwner) {
    actions.push(unpaid ? "checkout" : "portal");
    if (changeWindowOpen(choice, now)) actions.push("change_pick");
    if (unpaid) actions.push("claim_free", "delete");
  }
  if (role !== "user") actions.push("move_out");
  if (!billing.isBillingOwner) actions.push("ask_owner");
  return actions;
}
