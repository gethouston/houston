import type { BillingInterval, SeatPrices } from "@houston/engine-adapter";
import {
  DEFAULT_CHECKOUT_INTERVAL,
  sellableInterval,
  sellsYearly,
} from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePortal } from "../../hooks/queries/use-billing.ts";
import { useOrgCheckout } from "../../hooks/queries/use-org-checkout.ts";
import { canPurchaseInApp } from "../../lib/purchase-policy.ts";
import { FallbackLink } from "../shell/fallback-link.tsx";
import { PlanWebNote } from "../shell/plan-web-note.tsx";
import type { BillingTabAction } from "./billing-tab-model.ts";
import { CheckoutPriceLine } from "./checkout-price-line.tsx";
import { SeatIntervalChoice } from "./seat-interval-choice.tsx";

const BENEFITS = [
  "billing.benefitUsage",
  "billing.benefitRoutines",
  "billing.benefitAway",
] as const;

/** The foot of the plan card: the one thing the caller can do about billing. */
export function BillingPlanAction({
  action,
  orgSlug,
  prices,
  seats,
}: {
  action: BillingTabAction;
  orgSlug: string;
  prices: SeatPrices;
  seats: number;
}) {
  const { t } = useTranslation("teams");
  const checkout = useOrgCheckout();
  const portal = usePortal();
  const [picked, setPicked] = useState<BillingInterval>(
    DEFAULT_CHECKOUT_INTERVAL,
  );
  const interval = sellableInterval(prices, picked);
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      {checkout.succeeded === orgSlug && (
        <p role="status" className="text-sm text-success-ink">
          {t("billing.success")}
        </p>
      )}
      {action === "checkout" && (
        <>
          <ul className="space-y-2">
            {BENEFITS.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm">
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-ink-muted"
                />
                {t(key)}
              </li>
            ))}
          </ul>
          {sellsYearly(prices) && (
            <SeatIntervalChoice
              prices={prices}
              value={interval}
              onChange={setPicked}
              disabled={checkout.outstanding}
            />
          )}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CheckoutPriceLine
              prices={prices}
              interval={interval}
              seats={seats}
            />
            <Button
              className="self-start md:self-auto"
              disabled={checkout.outstanding}
              onClick={() => checkout.start(orgSlug, interval)}
            >
              {t("billing.upgrade")}
            </Button>
          </div>
          {checkout.orgSlug === orgSlug && checkout.fallbackUrl && (
            <FallbackLink
              className="self-start text-sm"
              href={checkout.fallbackUrl}
              command="billing_checkout_open"
            >
              {t("billing.openCheckout")}
            </FallbackLink>
          )}
        </>
      )}
      {action === "portal" && (
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="self-start"
            disabled={portal.isPending}
            onClick={() => portal.mutate()}
          >
            {t("billing.manage")}
          </Button>
          {portal.fallbackUrl && (
            <FallbackLink
              className="self-start text-sm"
              href={portal.fallbackUrl}
              command="billing_portal_open"
            >
              {t("billing.openPortal")}
            </FallbackLink>
          )}
        </div>
      )}
      {action === "web" && <PlanWebNote variant="managed" />}
      {action === "ask_owner" && (
        <p className="text-sm text-ink-muted">
          {canPurchaseInApp() ? t("billing.askOwner") : t("native.askOwner")}
        </p>
      )}
    </div>
  );
}
