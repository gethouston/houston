import type { PlanSummary } from "@houston/engine-adapter";
import { planOffer, planPriceAmounts } from "@houston/sdk";
import { Button, Card } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../../lib/purchase-policy";
import { PlanPrice } from "./plan-price";

const BENEFITS = [
  "benefitMessages",
  "benefitRoutines",
  "benefitAway",
  "benefitSpaces",
] as const;

/** The Free plan's offer of Plus. A sale, so the store apps never draw it. */
export function UpgradeCard({
  plan,
  onUpgrade,
  upgrading,
  checkoutFallback,
}: {
  plan: PlanSummary;
  onUpgrade: () => void;
  upgrading: boolean;
  /** The checkout link to offer when no browser opened, placed by the
   *  caller (`self-start`). */
  checkoutFallback?: ReactNode;
}) {
  const { t, i18n } = useTranslation("plan");
  if (!canPurchaseInApp()) return null;
  const offer = planOffer(plan, i18n.language);
  return (
    <Card className="gap-5 px-5 py-5 md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{t("upgradeTitle")}</h2>
          {offer && (
            <p className="text-sm font-medium">
              {t("offerLead", {
                amount: offer.amount,
                price: planPriceAmounts(plan, i18n.language).current,
              })}
            </p>
          )}
          <PlanPrice plan={plan} />
        </div>
        <Button disabled={upgrading} onClick={onUpgrade}>
          {offer ? t("getPlusFor", { amount: offer.amount }) : t("upgrade")}
        </Button>
      </div>
      {checkoutFallback}
      <div className="grid gap-3 border-t border-line pt-5 md:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <p
            key={benefit}
            className="flex items-start gap-2 text-sm text-ink-muted"
          >
            <Check
              className="mt-0.5 size-4 shrink-0 text-success-ink"
              aria-hidden
            />
            {t(benefit)}
          </p>
        ))}
      </div>
    </Card>
  );
}
