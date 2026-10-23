import type { BillingInterval } from "@houston/engine-adapter";
import {
  formatCutoverDay,
  formatPlanAmount,
  type PromoEndedView,
  sellsYearly,
} from "@houston/sdk";
import { DialogDescription, DialogTitle } from "@houston-ai/core";
import { Calendar } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { BILLING_CURRENCY } from "../organization/billing-tab-model";
import { SeatIntervalChoice } from "../organization/seat-interval-choice";
import { PlanBriefingCta, PlanBriefingQuietButton } from "./plan-briefing-cta";

const TITLE_CLASS =
  "pr-8 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink outline-none md:text-3xl";

/** The figures every step names, formatted in the reader's language. */
export function usePromoFacts(view: PromoEndedView, org: string) {
  const { i18n } = useTranslation("plan");
  const money = (cents: number) =>
    formatPlanAmount(cents, BILLING_CURRENCY, i18n.language);
  const yearly = view.prices?.annualCents ?? null;
  return {
    money,
    yearly,
    vars: {
      org,
      promo: money(view.previousCents),
      monthly: money(view.nextCents),
      date: formatCutoverDay(view.renewsAt, i18n.language),
      count: view.seats,
    },
  };
}

/**
 * The offer: the promotional price ends at the next charge; switch to yearly
 * (preselected, where it is sold; charged today, less Stripe's credit for the
 * unused part of the month) or keep monthly at the new price. The action
 * follows the pick; "Maybe later" closes it for this session.
 */
export function PromoOfferStep({
  view,
  org,
  pick,
  onPick,
  pending,
  onConfirm,
  onLater,
}: {
  view: PromoEndedView;
  org: string;
  pick: BillingInterval;
  onPick: (interval: BillingInterval) => void;
  pending: boolean;
  onConfirm: () => void;
  onLater: () => void;
}) {
  const { t } = useTranslation("plan");
  const { money, yearly, vars } = usePromoFacts(view, org);
  const offersYearly = sellsYearly(view.prices) && yearly !== null;
  const total =
    pick === "year" && yearly !== null
      ? money(yearly * view.seats)
      : money(view.nextCents * view.seats);
  return (
    <>
      <p className="ht-hairline mb-5 inline-flex items-center gap-1.5 self-start rounded-full bg-chip py-1 pl-2 pr-2.5 text-xs font-medium leading-5 text-ink">
        <Calendar aria-hidden className="size-3.5 text-ink-muted" />
        {t("promo.from", { date: vars.date })}
      </p>
      <DialogTitle tabIndex={-1} className={`mb-2 ${TITLE_CLASS}`}>
        {t("promo.title")}
      </DialogTitle>
      <DialogDescription className="mb-6 text-base leading-normal text-ink-muted">
        {offersYearly ? t("promo.body", vars) : t("promo.bodyMonthly", vars)}
      </DialogDescription>
      {offersYearly && view.prices && (
        <div className="plan-briefing-stagger mb-3">
          <SeatIntervalChoice
            prices={view.prices}
            value={pick}
            onChange={onPick}
            disabled={pending}
            yearlyFirst
          />
        </div>
      )}
      <p
        aria-live="polite"
        className="mb-8 text-sm leading-normal text-ink-muted tabular-nums"
      >
        <Trans
          t={t}
          i18nKey={pick === "year" ? "promo.total.year" : "promo.total.month"}
          values={{ ...vars, total }}
          components={{ b: <b className="font-medium text-ink" /> }}
        />
      </p>
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta
          label={
            pending
              ? t("promo.switching")
              : pick === "year"
                ? t("promo.switch")
                : t("promo.stay", vars)
          }
          disabled={pending}
          onClick={onConfirm}
        />
        <PlanBriefingQuietButton onClick={onLater} disabled={pending}>
          {t("maybeLater")}
        </PlanBriefingQuietButton>
      </div>
    </>
  );
}
