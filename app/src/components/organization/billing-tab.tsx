import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing.ts";
import { BillingPlanCard } from "./billing-plan-card.tsx";
import { BillingTabSkeleton } from "./billing-tab-skeleton.tsx";
import { BillingUsageCard } from "./billing-usage-card.tsx";

/**
 * Admin > Billing: what the active org costs and who pays, read off the org's
 * own billing on the orgs list (`useActiveOrgBilling`). The billing owner
 * upgrades a free org or manages a paid one; other owners and admins see the
 * same state and seats and are told to ask the owner. Plain members never
 * reach it (`canSeeBillingTab`). A free org also shows its weekly pool as a
 * share of the week, never as a message count.
 *
 * Checkout and the portal surface their own failures through the engine
 * call, so nothing here reports a second time.
 */
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
