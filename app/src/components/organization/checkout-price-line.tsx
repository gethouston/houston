import type { BillingInterval, SeatPrices } from "@houston/engine-adapter";
import { checkoutTotal, formatPlanAmount, sellsYearly } from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { BILLING_CURRENCY } from "./billing-tab-model.ts";

/**
 * The bill a checkout starts, under the way to pay. Beside the interval choice
 * it is the total alone ("$540 a year for 3 members"): each row already says
 * the price per member. Where only monthly is sold there is no choice, so the
 * line says the price per member too.
 */
export function CheckoutPriceLine({
  prices,
  interval,
  seats,
  className,
}: {
  /** Null while the wire states no price: nothing is drawn. */
  prices: SeatPrices | null;
  interval: BillingInterval;
  seats: number;
  className?: string;
}) {
  const { t, i18n } = useTranslation("teams");
  const money = (cents: number) =>
    formatPlanAmount(cents, BILLING_CURRENCY, i18n.language);
  if (!prices) return null;
  const count = Math.max(1, seats);
  const total = money(checkoutTotal(prices, interval, count));
  return (
    <p
      className={cn("text-sm text-ink-muted tabular-nums", className)}
      data-testid="checkout-price-line"
    >
      {!sellsYearly(prices)
        ? t("billing.upgradePrice", {
            price: money(prices.monthlyCents),
            total,
            count,
          })
        : interval === "year"
          ? t("billing.checkoutTotal.year", { total, count })
          : t("billing.checkoutTotal.month", { total, count })}
    </p>
  );
}
