import type { PromoEndedView } from "@houston/sdk";
import { formatCutoverDay } from "@houston/sdk";
import { DialogDescription, DialogTitle } from "@houston-ai/core";
import { Check, CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlanBriefingCta } from "./plan-briefing-cta";
import { usePromoFacts } from "./promo-ended-steps";

const DONE_TITLE_CLASS =
  "mb-2 pr-8 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink outline-none";

/** Switched: what the org pays now, read off its billing after the switch. */
export function PromoYearlyStep({
  view,
  org,
  next,
  onClose,
}: {
  view: PromoEndedView;
  org: string;
  /** The yearly charge and its date, off the org's billing after the switch. */
  next: { totalCents: number; at: string };
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(["plan", "teams"]);
  const { money, yearly, vars } = usePromoFacts(view, org);
  const rows: [string, string][] = [
    [t("plan:promo.row.plan"), t("teams:billing.interval.year")],
    [t("promo.row.members"), String(view.seats)],
    [
      t("promo.row.next"),
      t("promo.row.nextValue", {
        total: money(next.totalCents),
        date: formatCutoverDay(next.at, i18n.language),
      }),
    ],
  ];
  return (
    <>
      <span
        aria-hidden
        className="plan-briefing-badge mb-5 grid size-13 place-items-center rounded-full bg-success/15 text-success-ink"
      >
        <Check className="size-6.5" strokeWidth={2.5} />
      </span>
      <DialogTitle tabIndex={-1} className={DONE_TITLE_CLASS}>
        {t("promo.yearly.title")}
      </DialogTitle>
      <DialogDescription className="mb-5 text-base leading-normal text-ink-muted">
        {t("promo.yearly.sub", {
          ...vars,
          promo: money(yearly === null ? view.previousCents : yearly / 12),
        })}
      </DialogDescription>
      <ul className="ht-hairline plan-briefing-stagger mb-4 divide-y divide-line rounded-xl bg-chip">
        {rows.map(([label, value]) => (
          <li
            key={label}
            className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm"
          >
            <span className="text-ink-muted">{label}</span>
            <span className="text-right text-ink tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
      <p className="mb-8 text-[13px] leading-normal text-ink-muted">
        {t("promo.yearly.fine")}
      </p>
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta label={t("promo.done")} onClick={onClose} />
      </div>
    </>
  );
}

/** Stayed monthly: what the org pays from the next charge. */
export function PromoMonthlyStep({
  view,
  org,
  onClose,
}: {
  view: PromoEndedView;
  org: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("plan");
  const { money, vars } = usePromoFacts(view, org);
  return (
    <>
      <span
        aria-hidden
        className="ht-hairline mb-5 grid size-13 place-items-center rounded-full bg-chip text-ink"
      >
        <CreditCard className="size-6" />
      </span>
      <DialogTitle tabIndex={-1} className={DONE_TITLE_CLASS}>
        {t("promo.monthly.title")}
      </DialogTitle>
      <DialogDescription className="mb-8 text-base leading-normal text-ink-muted">
        {t("promo.monthly.sub", {
          ...vars,
          total: money(view.nextCents * view.seats),
        })}
      </DialogDescription>
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta label={t("promo.gotIt")} onClick={onClose} />
      </div>
    </>
  );
}
