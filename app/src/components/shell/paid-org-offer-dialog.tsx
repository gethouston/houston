import type {
  BillingInterval,
  SeatIntervalRefusal,
} from "@houston/engine-adapter";
import {
  DEFAULT_CHECKOUT_INTERVAL,
  formatPlanAmount,
  sellableInterval,
  sellsYearly,
} from "@houston/sdk";
import { FormDialog } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { useOrgCheckout } from "../../hooks/queries/use-org-checkout";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { BILLING_CURRENCY } from "../organization/billing-tab-model";
import { CheckoutPriceLine } from "../organization/checkout-price-line";
import { SeatIntervalChoice } from "../organization/seat-interval-choice";
import { CheckoutOpenNote } from "./checkout-open-note";
import type { PaidOrgOffer } from "./create-org-offer";

export function PaidOrgOfferDialog({
  open,
  onOpenChange,
  offer,
  checkout,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: PaidOrgOffer;
  checkout: ReturnType<typeof useOrgCheckout>;
  pending: boolean;
  onSubmit: (
    interval: BillingInterval,
  ) => Promise<SeatIntervalRefusal | undefined>;
}) {
  const { t, i18n } = useTranslation(["teams", "common", "plan"]);
  const [picked, setPicked] = useState<BillingInterval>(
    DEFAULT_CHECKOUT_INTERVAL,
  );
  const [submitted, setSubmitted] = useState(false);
  const purchasable = canPurchaseInApp();
  const { outstanding } = checkout;
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
              onClick: async () => {
                setSubmitted(true);
                const refusal = await onSubmit(interval).catch(
                  (error: unknown) => {
                    setSubmitted(false);
                    throw error;
                  },
                );
                if (!refusal) return;
                setSubmitted(false);
                setPicked("month");
                return false;
              },
              disabled: outstanding,
            }
          : { label: t("common:actions.close") }
      }
      secondary={purchasable ? undefined : null}
      labels={{
        cancel: t("common:actions.cancel"),
        close: t("common:actions.close"),
      }}
    >
      <div className="flex flex-col gap-3" data-testid="paid-org-offer">
        {choosing && prices && (
          <SeatIntervalChoice
            prices={prices}
            value={interval}
            onChange={setPicked}
            disabled={pending || outstanding}
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
        {purchasable && !submitted && (
          <CheckoutOpenNote checkout={checkout} orgSlug={null} />
        )}
      </div>
    </FormDialog>
  );
}
