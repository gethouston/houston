import type {
  BillingInterval,
  OrgBilling,
  OrgSummary,
} from "@houston/engine-adapter";
import { DEFAULT_CHECKOUT_INTERVAL, sellableInterval } from "@houston/sdk";
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
 * the browser keeps the tab. Where only monthly is sold the buttons start the
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
  onStart: (interval: BillingInterval) => void;
}) {
  const { t } = useTranslation("teams");
  const [picked, setPicked] = useState<BillingInterval>(
    DEFAULT_CHECKOUT_INTERVAL,
  );
  const prices = billing.seatPrices;
  const interval = sellableInterval(prices, picked);
  const seats = Math.max(1, billing.seats);
  if (!canPurchaseInApp()) return null;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(
        locked ? "status.checkout.unlockTitle" : "status.checkout.upgradeTitle",
        { org: org.name },
      )}
      description={t(
        locked ? "status.checkout.unlockBody" : "status.checkout.upgradeBody",
        { org: org.name },
      )}
      primary={{
        label: t("status.checkout.submit"),
        onClick: () => onStart(interval),
      }}
      labels={{ cancel: t("status.checkout.cancel") }}
    >
      <div className="flex flex-col gap-3" data-testid="team-status-checkout">
        <SeatIntervalChoice
          prices={prices}
          value={interval}
          onChange={setPicked}
        />
        <CheckoutPriceLine prices={prices} interval={interval} seats={seats} />
      </div>
    </FormDialog>
  );
}
