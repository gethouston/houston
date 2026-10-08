import { Button, Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { usePlan, usePlusPortal } from "../../../hooks/queries/use-plan";
import { usePlusCheckout } from "../../../hooks/queries/use-plus-checkout";
import { useUIStore } from "../../../stores/ui";
import { FallbackLink } from "../../shell/fallback-link";
import { UsageCard } from "./billing-cards";
import { BillingInvoices } from "./billing-invoices";
import { UpgradeCard } from "./billing-upgrade-card";
import { CurrentPlanCard } from "./plan-current-card";

export function PlanSection() {
  const { t } = useTranslation("plan");
  const { data: plan, isLoading, isError, refetch } = usePlan();
  const checkout = usePlusCheckout();
  const portal = usePlusPortal();
  const openSettings = useUIStore((s) => s.openSettings);
  return (
    <section className="space-y-5 py-6 text-ink md:space-y-6">
      <header className="space-y-2 pb-2">
        <h1 className="text-2xl font-normal text-balance">{t("title")}</h1>
        <p className="text-sm text-ink-muted">
          {t("questions")}{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => openSettings("reportBug")}
          >
            {t("contact")}
          </Button>
        </p>
      </header>
      {isLoading ? (
        <div className="space-y-5" role="status" aria-label={t("loading")}>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="space-y-3 py-6">
          <p className="text-sm text-ink-muted">{t("error")}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : plan ? (
        <>
          {checkout.succeeded && (
            <p role="status" className="text-sm text-success-ink">
              {t("success")}
            </p>
          )}
          <CurrentPlanCard
            plan={plan}
            managing={portal.isPending}
            onManage={() => portal.mutate()}
            portalFallback={
              portal.fallbackUrl && (
                <FallbackLink
                  className="mt-4 self-start text-sm"
                  href={portal.fallbackUrl}
                  command="plus_portal_open"
                >
                  {t("openPortal")}
                </FallbackLink>
              )
            }
          />
          {plan.plan === "free" && (
            <>
              <UpgradeCard
                plan={plan}
                upgrading={checkout.outstanding}
                onUpgrade={checkout.start}
                checkoutFallback={
                  checkout.fallbackUrl && (
                    <FallbackLink
                      className="self-start text-sm"
                      href={checkout.fallbackUrl}
                      command="plus_checkout_open"
                    >
                      {t("openCheckout")}
                    </FallbackLink>
                  )
                }
              />
              <UsageCard plan={plan} />
            </>
          )}
          <BillingInvoices />
        </>
      ) : null}
    </section>
  );
}
