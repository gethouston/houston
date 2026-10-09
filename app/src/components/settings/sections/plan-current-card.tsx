import type { PlanSummary } from "@houston/engine-adapter";
import { billingCards, formatLocalDate } from "@houston/sdk";
import { Button, Card } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../../lib/purchase-policy";
import { PlanWebNote } from "../../shell/plan-web-note";
import { PlanPrice } from "./plan-price";

/**
 * The person's plan: its name, its state and, where Houston may sell
 * (`canPurchaseInApp`), its price and the way into the billing portal. The
 * store apps draw the managed-on-the-web line in the portal's place.
 */
export function CurrentPlanCard({
  plan,
  onManage,
  managing,
  portalFallback,
}: {
  plan: PlanSummary;
  onManage: () => void;
  managing: boolean;
  /** The portal link to offer when no browser opened, placed by the caller
   *  (`mt-4 self-start`). */
  portalFallback?: ReactNode;
}) {
  const { t, i18n } = useTranslation("plan");
  const cards = billingCards(plan);
  const purchasable = canPurchaseInApp();
  const date =
    plan.plus.renewsAt && formatLocalDate(plan.plus.renewsAt, i18n.language);
  return (
    <Card className="gap-0 px-5 py-5 md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">
            {plan.plan === "free" ? t("freePlan") : t("plus")}
          </h2>
          {plan.plan === "free" ? (
            <p className="text-sm text-ink-muted">{t("freeEverywhere")}</p>
          ) : (
            <PlanPrice plan={plan} />
          )}
          {plan.plan === "plus" && cards.renewal !== "none" && (
            <p className="text-sm text-ink-muted">
              {cards.renewal === "paymentIssue"
                ? t("payment")
                : t(cards.renewal === "ends" ? "cancel" : "renew", {
                    date,
                  })}
            </p>
          )}
        </div>
        {purchasable && cards.manage && (
          <Button variant="outline" disabled={managing} onClick={onManage}>
            {t("manage")}
          </Button>
        )}
      </div>
      {purchasable && cards.manage && portalFallback}
      {!purchasable && <PlanWebNote variant="managed" className="mt-4" />}
    </Card>
  );
}
