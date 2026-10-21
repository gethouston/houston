import { orgRecovery, orgStanding } from "@houston/sdk";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../lib/purchase-policy.ts";
import { useActiveOrgBilling } from "./queries/use-billing.ts";

/**
 * Whether the active org refuses writes (it is locked, owner included), and
 * the sentence a disabled control shows for it. Reads stay open, so a
 * surface disables only what writes.
 */
export function useOrgWriteLock(): { locked: boolean; reason: string } {
  const { t } = useTranslation("teams");
  const { billing, org } = useActiveOrgBilling();
  const locked = orgStanding(billing, org?.degraded ?? false) === "locked";
  if (!locked) return { locked, reason: "" };
  const name = org?.name ?? "";
  const way = orgRecovery(billing, org?.role ?? "user", null)[0];
  const key = !canPurchaseInApp()
    ? "store"
    : way === "checkout"
      ? "unlock"
      : way === "portal"
        ? "fixPayment"
        : "askOwner";
  return { locked, reason: t(`status.writeLocked.${key}`, { org: name }) };
}
