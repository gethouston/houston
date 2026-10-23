import type { BillingInterval } from "@houston/engine-adapter";
import {
  DEFAULT_CHECKOUT_INTERVAL,
  formatPlanAmount,
  sellableInterval,
  sellsYearly,
} from "@houston/sdk";
import { FormDialog } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { BILLING_CURRENCY } from "../organization/billing-tab-model";
import { CheckoutPriceLine } from "../organization/checkout-price-line";
import { SeatIntervalChoice } from "../organization/seat-interval-choice";
import type { PaidOrgOffer } from "./create-org-offer";

/**
 * The create dialog once the free slot is taken: create the org as a paid one,
 * monthly or yearly where the gateway sells both, and continue to its checkout.
 * A new org has one member, so the line under the choice is one seat's bill.
 * Where the prices are unknown it offers the paid create, monthly, without a
 * figure. The store apps never sell, so there it only says the slot is taken.
 */
export function PaidOrgOfferDialog({
  open,
  onOpenChange,
  offer,
  outstanding,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: PaidOrgOffer;
  outstanding: boolean;
  onSubmit: (interval: BillingInterval) => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation(["teams", "common", "plan"]);
  const [picked, setPicked] = useState<BillingInterval>(
    DEFAULT_CHECKOUT_INTERVAL,
  );
  const purchasable = canPurchaseInApp();
  const prices = offer.seatPrices;
  const interval = prices ? sellableInterval(prices, picked) : "month";
  const choosing = purchasable && sellsYearly(prices);
  const freeOrg =
    offer.freeOrg?.kind === "personal"
      ? t("plan:choice.picker.personal")
      : offer.freeOrg?.name;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        purchasable
          ? t("teams:createTeam.paidTitle", { name: offer.name })
          : t("teams:native.freeTakenTitle")
      }
      description={
        freeOrg
          ? t("teams:createTeam.freeTaken", { freeOrg })
          : t("teams:createTeam.freeTakenUnknown")
      }
      primary={
        purchasable
          ? {
              label: t("teams:createTeam.paidSubmit"),
              pendingLabel: t("teams:createTeam.creating"),
              onClick: () => onSubmit(interval),
              disabled: outstanding,
            }
          : { label: t("common:actions.close") }
      }
      secondary={purchasable ? undefined : null}
      labels={{ cancel: t("common:actions.cancel") }}
    >
      <div className="flex flex-col gap-3" data-testid="paid-org-offer">
        {choosing && prices && (
          <SeatIntervalChoice
            prices={prices}
            value={interval}
            onChange={setPicked}
          />
        )}
        {choosing && prices && (
          <CheckoutPriceLine prices={prices} interval={interval} seats={1} />
        )}
        <p className="text-sm text-ink-muted">
          {!purchasable
            ? t("teams:native.freeTakenBody")
            : prices && !choosing
              ? t("teams:createTeam.paidPrice", {
                  name: offer.name,
                  price: formatPlanAmount(
                    prices.monthlyCents,
                    BILLING_CURRENCY,
                    i18n.language,
                  ),
                })
              : t("teams:createTeam.paidInBrowser", { name: offer.name })}
        </p>
      </div>
    </FormDialog>
  );
}
