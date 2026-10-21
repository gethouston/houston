import type { BillingChoice } from "@houston/engine-adapter";
import { DialogDescription, DialogTitle } from "@houston-ai/core";
import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IntroNotice } from "./billing-change-copy";
import { useNoticePoints } from "./billing-change-copy";
import { PlanBriefingCta, PlanBriefingQuietButton } from "./plan-briefing-cta";

/**
 * The modal's first step: when the change lands, what it means as a few
 * points, and the action. An owner who has to pick goes on to the picker;
 * everyone else reads it and closes it.
 */
export function BillingChangeIntro({
  notice,
  choice,
  onPick,
  onClose,
}: {
  notice: IntroNotice;
  choice: BillingChoice;
  onPick: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("plan");
  const points = useNoticePoints(notice, choice);
  const pick = notice.kind === "pick";
  return (
    <>
      <p className="ht-hairline mb-5 inline-flex items-center gap-1.5 self-start rounded-full bg-chip py-1 pl-2 pr-2.5 text-xs font-medium leading-5 text-ink">
        <Calendar aria-hidden className="size-3.5 text-ink-muted" />
        {t("choice.notice.from", { date: notice.date })}
      </p>
      <DialogTitle
        tabIndex={-1}
        className="mb-2 pr-8 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink outline-none md:text-3xl"
      >
        {t("choice.notice.title")}
      </DialogTitle>
      <DialogDescription className="mb-7 text-base leading-normal text-ink-muted">
        {t("choice.notice.thanks")}
      </DialogDescription>
      <ul className="plan-briefing-stagger mb-8 flex flex-col gap-4 md:gap-5">
        {points.map(({ icon: Icon, title, body }) => (
          <li key={title} className="grid grid-cols-[auto_1fr] gap-3.5">
            <span
              aria-hidden
              className="ht-hairline grid size-10 place-items-center rounded-xl bg-chip text-ink"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="mt-px text-base font-medium leading-snug text-ink">
                {title}
              </p>
              <p className="mt-0.5 text-sm leading-normal text-ink-muted">
                {body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {/* The phone sheet seats the actions at the bottom, under the thumb. */}
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta
          label={pick ? t("choice.notice.choose") : t("choice.notice.gotIt")}
          onClick={pick ? onPick : onClose}
        />
        {pick && (
          <PlanBriefingQuietButton onClick={onClose}>
            {t("maybeLater")}
          </PlanBriefingQuietButton>
        )}
      </div>
    </>
  );
}
