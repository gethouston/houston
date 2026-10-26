import type { OrgBilling } from "@houston/engine-adapter";
import {
  billingRenewal,
  formatLocalDate,
  formatPlanAmount,
  orgBillingPrice,
  seatUsageView,
} from "@houston/sdk";
import { Card, StatusBadge, type StatusKind } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy.ts";
import { BillingPlanAction } from "./billing-plan-action.tsx";
import { BillingSeatUsage } from "./billing-seat-usage.tsx";
import {
  BILLING_CURRENCY,
  type BillingTabStatus,
  billingAction,
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
 * The org's plan: Free or Paid, its seats and what they bill per the
 * subscription's interval (a month or a year), when it renews or next bills,
 * a seat grace's two prices, a scheduled lock, and the one action the caller
 * has. A live yearly org counts its paid seats (priced for the payer alone)
 * and, while some are free, how many are in use.
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
  const lockAt = scheduledLock(billing, now);
  const money = (cents: number) =>
    formatPlanAmount(cents, BILLING_CURRENCY, i18n.language);
  const day = (iso: string) => formatLocalDate(iso, i18n.language);
  const paid = billing.tier === "paid";
  const seats = Math.max(1, billing.seats);
  // The store apps never draw a price (`purchase-policy`), and an org whose
  // interval the wire does not state (a comp grant, an ended subscription)
  // shows its seats alone. During a seat grace the header names the seats
  // alone: the grace line says the prices.
  const purchasable = canPurchaseInApp();
  const price = orgBillingPrice(billing, now);
  const priced = purchasable && price.kind === "priced" ? price : null;
  const yearly = priced?.interval === "year";
  const usage = seatUsageView(billing);
  const renewal = billingRenewal(billing);
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
              : usage
                ? billing.isBillingOwner && priced && priced.today === null
                  ? t("billing.paidSeatsYear", {
                      count: usage.paidSeats,
                      total: money(priced.total),
                    })
                  : t("billing.paidSeats", { count: usage.paidSeats })
                : priced && priced.today === null
                  ? t(
                      yearly ? "billing.seatsTotalYear" : "billing.seatsTotal",
                      {
                        count: seats,
                        total: money(priced.total),
                      },
                    )
                  : t("billing.seats", { count: seats })}
          </p>
          {renewal && (
            <p className="text-sm text-ink-muted tabular-nums">
              {t(
                renewal.kind === "renews"
                  ? "billing.renews"
                  : "billing.nextBill",
                { date: day(renewal.at) },
              )}
            </p>
          )}
        </div>
        {badge && (
          <StatusBadge
            status={badge}
            label={t(`billing.status.${status}`)}
            className="mt-1.5 shrink-0"
          />
        )}
      </div>
      {priced && priced.today !== null && priced.graceEndsAt && (
        <p className="text-sm tabular-nums">
          {t(yearly ? "billing.graceYear" : "billing.grace", {
            today: money(priced.today),
            date: day(priced.graceEndsAt),
            total: money(priced.total),
          })}
        </p>
      )}
      {usage && (
        <BillingSeatUsage usage={usage} pays={billing.isBillingOwner} />
      )}
      {lockAt && (
        <p className="text-sm text-warning-ink">
          {t("billing.locksOn", { date: day(lockAt) })}
        </p>
      )}
      <BillingPlanAction
        action={billingAction(billing, purchasable)}
        orgSlug={orgSlug}
        prices={billing.seatPrices}
        seats={seats}
      />
    </Card>
  );
}
