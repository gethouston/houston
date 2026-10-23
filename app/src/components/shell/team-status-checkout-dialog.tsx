import type {
  BillingInterval,
  OrgBilling,
  OrgSummary,
  SeatIntervalRefusal,
} from "@houston/engine-adapter";
import {
  DEFAULT_CHECKOUT_INTERVAL,
  sellableInterval,
  sellsYearly,
} from "@houston/sdk";
import { FormDialog } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { CheckoutPriceLine } from "../organization/checkout-price-line";
import { SeatIntervalChoice } from "../organization/seat-interval-choice";

/**
 * Unlock or Upgrade from the status strip or a locked chat, where the gateway
 * sells a yearly seat: pick monthly or yearly, see what the org's members
 * bill, then continue to checkout. `onStart` opens it inside this click, so
 * the browser keeps the tab, and the dialog stays up until the gateway
 * answers: a refused yearly keeps it open on monthly, the refetched prices
 * offering monthly alone. Where only monthly is sold the buttons start the
 * checkout directly and this never opens.
 */
export function TeamStatusCheckoutDialog({
  open,
  onOpenChange,
  org,
  billing,
  locked,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  org: OrgSummary;
  billing: OrgBilling;
  locked: boolean;
  onStart: (interval: BillingInterval) => Promise<SeatIntervalRefusal | null>;
}) {
  const { t } = useTranslation(["teams", "common"]);
  const [picked, setPicked] = useState<BillingInterval>(
    DEFAULT_CHECKOUT_INTERVAL,
  );
  const prices = billing.seatPrices;
  const interval = prices ? sellableInterval(prices, picked) : "month";
  const seats = Math.max(1, billing.seats);
  if (!canPurchaseInApp()) return null;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(
        locked
          ? "teams:status.checkout.unlockTitle"
          : "teams:status.checkout.upgradeTitle",
        { org: org.name },
      )}
      description={t(
        locked
          ? "teams:status.checkout.unlockBody"
          : "teams:status.checkout.upgradeBody",
        { org: org.name },
      )}
      primary={{
        label: t("teams:status.checkout.submit"),
        onClick: async () => {
          const refusal = await onStart(interval);
          if (!refusal) return;
          setPicked("month");
          return false;
        },
      }}
      labels={{
        cancel: t("teams:status.checkout.cancel"),
        close: t("common:actions.close"),
      }}
    >
      <div className="flex flex-col gap-3" data-testid="team-status-checkout">
        {prices && sellsYearly(prices) && (
          <SeatIntervalChoice
            prices={prices}
            value={interval}
            onChange={setPicked}
          />
        )}
        <CheckoutPriceLine prices={prices} interval={interval} seats={seats} />
      </div>
    </FormDialog>
  );
}
