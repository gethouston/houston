import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing.ts";
import { BillingPlanCard } from "./billing-plan-card.tsx";
import { BillingTabSkeleton } from "./billing-tab-skeleton.tsx";
import { BillingUsageCard } from "./billing-usage-card.tsx";

export default function BillingTab() {
  const { t } = useTranslation("teams");
  const { billing, orgSlug, isLoading } = useActiveOrgBilling();

  if (isLoading) return <BillingTabSkeleton />;

  if (!billing || !orgSlug) {
    return (
      <p className="py-10 text-sm text-ink-muted">{t("billing.unavailable")}</p>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4 py-6 md:gap-5">
      <BillingPlanCard billing={billing} orgSlug={orgSlug} />
      {billing.tier === "free" && billing.usage && (
        <BillingUsageCard billing={billing} />
      )}
    </div>
  );
}
