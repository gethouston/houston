import { layout } from "@houston/design-tokens";
import type { BillingInterval, OrgBilling } from "@houston/engine-adapter";
import {
  DEFAULT_CHECKOUT_INTERVAL,
  type PromoEndedView,
  promoEndedModalOpens,
  promoEndedView,
  sellsYearly,
} from "@houston/sdk";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import {
  useDismissPriceNotice,
  useSwitchToYearly,
} from "../../hooks/queries/use-price-notice";
import { useSeatRefusalToast } from "../../hooks/use-seat-refusal-toast";
import { showExpectedStateToast } from "../../lib/error-toast";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { PlanBriefingFrame } from "./plan-briefing-frame";
import { BriefingStep } from "./plan-briefing-swap";
import { PromoMonthlyStep, PromoYearlyStep } from "./promo-ended-answered";
import { PromoOfferStep } from "./promo-ended-steps";

type Answer =
  | {
      step: "yearly";
      view: PromoEndedView;
      next: { totalCents: number; at: string };
    }
  | { step: "monthly"; view: PromoEndedView };

function yearlyNext(
  view: PromoEndedView,
  billing: OrgBilling | null,
): { totalCents: number; at: string } {
  if (billing?.renewsAt && billing.seatPriceCents !== null)
    return {
      totalCents:
        billing.seatPriceCents *
        Math.max(1, billing.seatsInUse ?? billing.seats),
      at: billing.renewsAt,
    };
  return {
    totalCents: (view.prices?.annualCents ?? 0) * view.seats,
    at: view.renewsAt,
  };
}

export function PromoEndedModal({
  otherDialogOpen,
}: {
  otherDialogOpen: boolean;
}) {
  const { t } = useTranslation("plan");
  const { billing, org } = useActiveOrgBilling();
  const switching = useSwitchToYearly();
  const dismiss = useDismissPriceNotice();
  const announceRefusal = useSeatRefusalToast();
  const [closed, setClosed] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [picked, setPicked] = useState<BillingInterval>(
    DEFAULT_CHECKOUT_INTERVAL,
  );
  const view = canPurchaseInApp() ? promoEndedView(billing) : null;
  const opens = promoEndedModalOpens(view, {
    closedThisSession: closed,
    otherDialogOpen,
  });
  const shown = answer?.view ?? (opens ? view : null);
  if (!shown) return null;
  const orgName =
    org?.kind === "personal" ? t("choice.picker.personal") : (org?.name ?? "");
  const pick = sellsYearly(shown.prices) ? picked : "month";
  const pending = switching.isPending || dismiss.isPending;
  const close = () => {
    setAnswer(null);
    setClosed(true);
  };

  const confirm = async () => {
    if (pick === "month") {
      try {
        await dismiss.mutateAsync();
      } catch {
        return;
      }
      setAnswer({ step: "monthly", view: shown });
      return;
    }
    let result: Awaited<ReturnType<typeof switching.mutateAsync>>;
    try {
      result = await switching.mutateAsync();
    } catch {
      return;
    }
    switch (result.kind) {
      case "switched":
        setAnswer({
          step: "yearly",
          view: shown,
          next: yearlyNext(shown, result.billing),
        });
        return;
      case "already_yearly":
      case "no_subscription":
      case "switch_in_progress":
        close();
        return;
      case "payment_failed":
        showExpectedStateToast(
          t("promo.declined.title"),
          t("promo.declined.body"),
        );
        return;
      case "interval_unavailable":
        announceRefusal("interval_unavailable");
        setPicked("month");
        return;
    }
  };

  return (
    <PlanBriefingFrame
      open
      onDismiss={() => {
        if (!pending) close();
      }}
      closeLabel={answer ? t("choice.notice.close") : t("maybeLater")}
      width={layout["choice-dialog-width"]}
      testId="promo-ended-modal"
    >
      <BriefingStep step={answer?.step ?? "offer"}>
        {answer?.step === "yearly" ? (
          <PromoYearlyStep
            view={answer.view}
            org={orgName}
            next={answer.next}
            onClose={close}
          />
        ) : answer?.step === "monthly" ? (
          <PromoMonthlyStep view={answer.view} org={orgName} onClose={close} />
        ) : (
          <PromoOfferStep
            view={shown}
            org={orgName}
            pick={pick}
            onPick={setPicked}
            pending={pending}
            onConfirm={() => {
              void confirm();
            }}
            onLater={close}
          />
        )}
      </BriefingStep>
    </PlanBriefingFrame>
  );
}
