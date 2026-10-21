import { planComposerMode, planOffer, usagePercent } from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { usePlan } from "../../hooks/queries/use-plan";
import { usePlusCheckout } from "../../hooks/queries/use-plus-checkout";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { useUIStore } from "../../stores/ui";
import { FallbackLink } from "./fallback-link";
import { PlanWebNote } from "./plan-web-note";
import { PlanMessageLimitCard } from "./provider-error-cards/plan-limit";

/**
 * The composer's plan line, from the active org's pool: the usage hint from
 * 80% (with the way to Plus where Houston may sell, the managed-on-the-web
 * line in the store apps) and the limit card at 100%.
 */
export function usePlanComposerState() {
  const { t, i18n } = useTranslation("plan");
  const { billing } = useActiveOrgBilling();
  const { data: plan } = usePlan();
  const checkout = usePlusCheckout();
  const openSettings = useUIStore((s) => s.openSettings);
  const percent = usagePercent(billing);
  const mode = planComposerMode(billing);
  const purchasable = canPurchaseInApp();
  const offer = plan && purchasable ? planOffer(plan, i18n.language) : null;
  if (mode === "none" || percent === null) return { hint: null, limit: null };
  if (mode === "limit")
    return {
      hint: null,
      limit: (
        <PlanMessageLimitCard
          error={{
            kind: "plan_message_limit",
            provider: "",
            resets_at: billing?.usage?.resetsAt ?? "",
            message: "",
          }}
        />
      ),
    };
  return {
    hint: (
      <div className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-ink-muted md:gap-3">
        <span className="tabular-nums">{t("hint", { percent })}</span>
        {offer && <span>{t("offerHint", { amount: offer.amount })}</span>}
        {purchasable ? (
          <Button
            variant="link"
            className="h-auto p-0 text-xs font-normal text-link underline"
            disabled={offer !== null && checkout.outstanding}
            onClick={() => (offer ? checkout.start() : openSettings("plan"))}
          >
            {offer ? t("getPlusFor", { amount: offer.amount }) : t("upgrade")}
          </Button>
        ) : (
          <PlanWebNote variant="manage" className="text-xs" />
        )}
        {offer && checkout.fallbackUrl && (
          <FallbackLink
            href={checkout.fallbackUrl}
            command="plus_checkout_open"
          >
            {t("openCheckout")}
          </FallbackLink>
        )}
      </div>
    ),
    limit: null,
  };
}
