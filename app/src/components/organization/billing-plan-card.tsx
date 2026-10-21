import type { OrgBilling } from "@houston/engine-adapter";
import { formatLocalDate, formatPlanAmount } from "@houston/sdk";
import { Card, StatusBadge, type StatusKind } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy.ts";
import { BillingPlanAction } from "./billing-plan-action.tsx";
import {
  BILLING_CURRENCY,
  type BillingTabStatus,
  billingAction,
  billingPrice,
  billingStatus,
  scheduledLock,
} from "./billing-tab-model.ts";

const BADGE: Record<BillingTabStatus, StatusKind | null> = {
  free: null,
  paid: "active",
  past_due: "pending",
  locked: "error",
};

/**
 * The org's plan: Free or Paid, its seats and monthly price, a seat grace's
 * two prices, a scheduled lock, and the one action the caller has.
 */
export function BillingPlanCard({
  billing,
  orgSlug,
}: {
  billing: OrgBilling;
  orgSlug: string;
}) {
  const { t, i18n } = useTranslation("teams");
  const now = Date.now();
  const status = billingStatus(billing);
  const badge = BADGE[status];
  const price = billingPrice(billing, now);
  const lockAt = scheduledLock(billing, now);
  const money = (cents: number) =>
    formatPlanAmount(cents, BILLING_CURRENCY, i18n.language);
  const day = (iso: string) => formatLocalDate(iso, i18n.language);
  const paid = billing.tier === "paid";
  const seats = Math.max(1, billing.seats);
  // The store apps never draw a price (`purchase-policy`). During a seat
  // grace the header names the seats alone: the grace line says the prices.
  const purchasable = canPurchaseInApp();
  return (
    <Card className="gap-4 px-5 py-5 md:px-6" data-testid="billing-plan">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-medium text-balance">
            {t(paid ? "billing.planPaid" : "billing.planFree")}
          </h2>
          <p className="text-sm text-ink-muted tabular-nums">
            {!paid
              ? t("billing.freeSummary", { count: seats })
              : purchasable && price.today === null
                ? t("billing.seatsTotal", {
                    count: seats,
                    total: money(price.monthly),
                  })
                : t("billing.seats", { count: seats })}
          </p>
        </div>
        {badge && (
          <StatusBadge
            status={badge}
            label={t(`billing.status.${status}`)}
            className="mt-1.5 shrink-0"
          />
        )}
      </div>
      {purchasable && price.today !== null && price.graceEndsAt && (
        <p className="text-sm tabular-nums">
          {t("billing.grace", {
            today: money(price.today),
            date: day(price.graceEndsAt),
            total: money(price.monthly),
          })}
        </p>
      )}
      {lockAt && (
        <p className="text-sm text-warning-ink">
          {t("billing.locksOn", { date: day(lockAt) })}
        </p>
      )}
      <BillingPlanAction
        action={billingAction(billing, purchasable)}
        orgSlug={orgSlug}
        seatPrice={money(billing.seatPriceCents)}
        total={money(price.monthly)}
        seats={seats}
      />
    </Card>
  );
}
