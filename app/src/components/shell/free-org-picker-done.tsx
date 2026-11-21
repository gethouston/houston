import {
  type ChoiceDone,
  type FlowProgress,
  formatCutoverDate,
  formatCutoverDay,
} from "@houston/sdk";
import { DialogDescription, DialogTitle } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChoiceOrgList } from "./free-org-picker-list";
import { PickerProgress, useOrgName } from "./free-org-picker-rows";
import { PlanBriefingCta } from "./plan-briefing-cta";

export function DoneStep({
  done,
  onClose,
  until,
  closeLabel,
  progress = null,
}: {
  done: ChoiceDone;
  onClose: () => void;
  progress?: FlowProgress | null;
  until?: string | null;
  closeLabel?: string;
}) {
  const { t, i18n } = useTranslation("plan");
  const orgName = useOrgName();
  const lastDay =
    until !== undefined
      ? until
      : done.changeableUntil &&
        formatCutoverDay(done.changeableUntil, i18n.language);
  const hints = done.applied
    ? [
        lastDay ? t("choice.applied.until", { date: lastDay }) : null,
        done.orgs.some((org) => org.status === "locks")
          ? t("choice.applied.locks")
          : null,
      ]
    : [t("choice.done.change")];
  return (
    <>
      <PickerProgress progress={progress} />
      <span
        aria-hidden
        className="plan-briefing-badge mb-5 grid size-13 place-items-center rounded-full bg-success/15 text-success-ink"
      >
        <Check className="size-6.5" strokeWidth={2.5} />
      </span>
      <DialogTitle
        tabIndex={-1}
        className="mb-2 pr-8 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink outline-none"
      >
        {done.applied
          ? t("choice.applied.title", { name: orgName(done.free) })
          : t("choice.done.title", { name: orgName(done.free) })}
      </DialogTitle>
      <DialogDescription className="mb-5 text-base leading-normal text-ink-muted">
        {!done.applied
          ? t("choice.done.sub", {
              date: formatCutoverDate(done.cutoverAt, i18n.language),
            })
          : done.paid
            ? t("choice.applied.paid", { name: orgName(done.paid) })
            : t("choice.applied.now")}
      </DialogDescription>
      <ChoiceOrgList orgs={done.orgs} meta={done.applied} />
      <div className="mb-6 flex flex-col gap-1 text-[13px] text-ink-muted">
        {hints.map((hint) => hint && <p key={hint}>{hint}</p>)}
      </div>
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta
          label={closeLabel ?? t("choice.done.close")}
          onClick={onClose}
        />
      </div>
    </>
  );
}
