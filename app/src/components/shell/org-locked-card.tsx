import { LockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { useTeamStatus } from "../../hooks/use-team-status";
import { useTeamStatusActions } from "../../hooks/use-team-status-actions";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { RowCard } from "../cards/row-card";
import { RowCardButton } from "../cards/row-card-button";

/**
 * What a chat shows in place of its composer while the org is locked: the
 * same reason the strip gives, and the billing owner's way to pay. Everyone
 * else reads "ask the owner"; the store apps never sell, so they read it
 * with no button.
 */
export function OrgLockedCard() {
  const { t } = useTranslation("teams");
  const { reason } = useOrgWriteLock();
  const { view, org, checkout } = useTeamStatus(canPurchaseInApp());
  const actions = useTeamStatusActions(org?.slug ?? null, checkout);
  const pay =
    view.kind === "locked"
      ? view.buttons.find((a) => a === "checkout" || a === "portal")
      : undefined;
  return (
    <div className="w-full px-1 py-2" data-testid="org-locked-card">
      <RowCard
        media={<LockIcon className="size-5" />}
        title={t("status.lockedCard.title")}
        description={reason}
        action={
          pay && view.kind === "locked" ? (
            <RowCardButton
              label={t(
                pay === "checkout"
                  ? "status.actions.unlock"
                  : "status.actions.fixPayment",
              )}
              disabled={view.waiting || actions.paying}
              onClick={() => actions.run(pay)}
            />
          ) : undefined
        }
      />
    </div>
  );
}
