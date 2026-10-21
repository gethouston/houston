import { planComposerMode, usagePercent } from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { openAdmin } from "../../lib/open-admin";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { OrgLockedCard } from "./org-locked-card";
import { PlanWebNote } from "./plan-web-note";
import { PlanMessageLimitCard } from "./provider-error-cards/plan-limit";

/**
 * The composer's plan line, from the active org's pool: the usage hint from
 * 80% and the limit card at 100%. A locked org replaces the composer with
 * its locked card, whatever the pool says, since every send is refused. The hint ends on what the reader can do:
 * the billing owner's Upgrade (the managed-on-the-web line in the store
 * apps), or asking the owner for everyone else (nothing in the store apps).
 */
export function usePlanComposerState() {
  const { t } = useTranslation("plan");
  const { billing } = useActiveOrgBilling();
  const { locked } = useOrgWriteLock();
  const percent = usagePercent(billing);
  const mode = planComposerMode(billing);
  if (locked) return { hint: null, limit: <OrgLockedCard /> };
  if (mode === "none" || percent === null) return { hint: null, limit: null };
  if (mode === "limit")
    return {
      hint: null,
      limit: (
        <PlanMessageLimitCard
          error={{
            kind: "plan_message_limit",
            provider: "",
            resets_at: billing?.usage?.resetsAt ?? "",
            message: "",
            scope: "org",
          }}
        />
      ),
    };
  const purchasable = canPurchaseInApp();
  // The store apps never send anyone to upgrade, so a member there reads
  // the hint alone.
  const next = !billing?.isBillingOwner ? (
    purchasable && <span>{t("askOwnerHint")}</span>
  ) : purchasable ? (
    <Button
      variant="link"
      className="h-auto p-0 text-xs font-normal text-link underline"
      onClick={() => openAdmin({ section: "billing" })}
    >
      {t("upgrade")}
    </Button>
  ) : (
    <PlanWebNote variant="manage" className="text-xs" />
  );
  return {
    hint: (
      <div className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-ink-muted md:gap-3">
        <span className="tabular-nums">{t("hint", { percent })}</span>
        {next}
      </div>
    ),
    limit: null,
  };
}
