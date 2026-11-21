import type {
  BillingChoice,
  OrgBilling,
  OrgRecoveryAction,
  OrgRole,
} from "@houston/wire-types";
import { canChangeChoice } from "./choice-model";

export function orgRecovering(billing: OrgBilling | null | undefined): boolean {
  return (
    billing !== null &&
    billing !== undefined &&
    (billing.status !== "active" || billing.lockAt !== null)
  );
}

export function orgLocked(billing: OrgBilling | null | undefined): boolean {
  return billing?.status === "locked";
}

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

function changeWindowOpen(choice: BillingChoice | null, now: number): boolean {
  return choice?.state === "applied" && canChangeChoice(choice, now);
}

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
