import type { BillingChoice, SeatPrices } from "@houston/engine-adapter";
import type { ChoiceIntroPage, FlowProgress } from "@houston/sdk";
import { DialogDescription, DialogTitle } from "@houston-ai/core";
import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type IntroNotice,
  type NoticePoint,
  useNoticePoints,
  useNotKeptPoints,
} from "./billing-change-copy";
import { PickerProgress } from "./free-org-picker-rows";
import { PlanBriefingCta, PlanBriefingQuietButton } from "./plan-briefing-cta";

const TITLE_CLASS =
  "pr-8 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink outline-none md:text-3xl";

/**
 * The modal's intro, one page at a time ({@link ChoiceIntroPage}). An owner
 * who has to pick reads what changes, then what happens to the orgs they do
 * not keep free, and goes on to the picker; everyone else reads one page and
 * closes it. "Maybe later" sits on the first page only, Back on the rest.
 */
export function BillingChangeIntro({
  notice,
  choice,
  listPrices,
  page,
  progress,
  onNext,
  onBack,
  onClose,
}: {
  notice: IntroNotice;
  choice: BillingChoice;
  /** A new checkout's list prices, off the orgs list; null while unknown. */
  listPrices: SeatPrices | null;
  page: ChoiceIntroPage;
  progress: FlowProgress | null;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("plan");
  const points = useNoticePoints(notice, choice, listPrices);
  const notKept = useNotKeptPoints();
  const pick = notice.kind === "pick";
  if (page === "not_kept")
    return (
      <>
        <PickerProgress progress={progress} />
        <p className="mb-2 text-sm font-medium text-ink-muted">
          {t("choice.notice.notKept.label")}
        </p>
        <DialogTitle tabIndex={-1} className={`mb-7 ${TITLE_CLASS}`}>
          {t("choice.notice.notKept.title")}
        </DialogTitle>
        <Points points={notKept} />
        <Actions
          label={
            pick && notice.payer
              ? t("choice.notice.next")
              : t("choice.notice.choose")
          }
          onNext={onNext}
          quiet={t("choice.notice.back")}
          onQuiet={onBack}
        />
      </>
    );
  return (
    <>
      <PickerProgress progress={progress} />
      <p className="ht-hairline mb-5 inline-flex items-center gap-1.5 self-start rounded-full bg-chip py-1 pl-2 pr-2.5 text-xs font-medium leading-5 text-ink">
        <Calendar aria-hidden className="size-3.5 text-ink-muted" />
        {t("choice.notice.from", { date: notice.date })}
      </p>
      <DialogTitle
        tabIndex={-1}
        className={pick ? `mb-7 ${TITLE_CLASS}` : `mb-2 ${TITLE_CLASS}`}
      >
        {t("choice.notice.title")}
      </DialogTitle>
      {!pick && (
        <DialogDescription className="mb-7 text-base leading-normal text-ink-muted">
          {t("choice.notice.thanks")}
        </DialogDescription>
      )}
      <Points points={points} />
      {pick ? (
        <Actions
          label={t("choice.notice.next")}
          onNext={onNext}
          quiet={t("maybeLater")}
          onQuiet={onClose}
        />
      ) : (
        <Actions label={t("choice.notice.gotIt")} onNext={onClose} />
      )}
    </>
  );
}

function Points({ points }: { points: NoticePoint[] }) {
  return (
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
  );
}

/** The phone sheet seats the actions at the bottom, under the thumb. */
function Actions({
  label,
  onNext,
  quiet,
  onQuiet,
}: {
  label: string;
  onNext: () => void;
  quiet?: string;
  onQuiet?: () => void;
}) {
  return (
    <div className="mt-auto flex flex-col md:mt-0">
      <PlanBriefingCta label={label} onClick={onNext} />
      {quiet && onQuiet && (
        <PlanBriefingQuietButton onClick={onQuiet}>
          {quiet}
        </PlanBriefingQuietButton>
      )}
    </div>
  );
}
