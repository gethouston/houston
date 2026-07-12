import { AsyncButton, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  useBilling,
  useCheckout,
  usePortal,
} from "../../hooks/queries/use-billing.ts";
import { billingAction, trialDaysLeft } from "./billing-tab-model.ts";
import type { OrgTabProps } from "./organization-view.tsx";

/**
 * Organization > Billing (C8): the active team's seat subscription. Owner sees
 * the status, seat count, and either checkout buttons (monthly/annual) or a
 * "Manage billing" portal button once subscribed; an admin sees the same info
 * read-only with an "ask the owner" note (C8 admin degrade asymmetry — only the
 * owner can check out). Only mounts for owner/admin on a team space (the view
 * gates the tab via `canSeeBillingTab`), so a member never reaches it.
 *
 * All writes route through the billing hooks' `call()` wrapper, which surfaces
 * failures as a toast + report — no silent failures here.
 */
export default function BillingTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const { data: billing, isLoading } = useBilling();
  const checkout = useCheckout();
  const portal = usePortal();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!billing) {
    return (
      <p className="py-10 text-sm text-ink-muted">{t("billing.unavailable")}</p>
    );
  }

  const daysLeft = trialDaysLeft(billing, new Date());
  const statusLine =
    billing.status === "trialing" && daysLeft !== null
      ? t("billing.status.trialingDays", { count: daysLeft })
      : t(`billing.status.${billing.status}`);
  const action = billingAction(billing, ctx.isOwner);

  return (
    <div className="flex max-w-xl flex-col gap-6 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{statusLine}</p>
        <p className="text-sm text-ink-muted">
          {t("billing.seats", { count: billing.seats })}
          {billing.interval
            ? ` · ${t(`billing.interval.${billing.interval}`)}`
            : ""}
        </p>
      </div>

      {action === "checkout" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{t("billing.pickPlan")}</p>
          <div className="flex flex-wrap gap-3">
            <AsyncButton onClick={() => checkout.mutateAsync("monthly")}>
              {t("billing.checkoutMonthly")}
            </AsyncButton>
            <AsyncButton
              variant="secondary"
              onClick={() => checkout.mutateAsync("annual")}
            >
              {t("billing.checkoutAnnual")}
            </AsyncButton>
          </div>
        </div>
      )}

      {action === "portal" && (
        <div>
          <AsyncButton onClick={() => portal.mutateAsync()}>
            {t("billing.manage")}
          </AsyncButton>
        </div>
      )}

      {!ctx.isOwner && (
        <p className="text-sm text-ink-muted">{t("billing.askOwner")}</p>
      )}
    </div>
  );
}
