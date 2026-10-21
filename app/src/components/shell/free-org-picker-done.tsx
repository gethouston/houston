import {
  type ChoiceDone,
  formatCutoverDate,
  formatCutoverDay,
} from "@houston/sdk";
import { DialogDescription, DialogTitle } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChoiceOrgList } from "./free-org-picker-list";
import { useOrgName } from "./free-org-picker-rows";
import { PlanBriefingCta } from "./plan-briefing-cta";

/**
 * What a stored pick means, in the same frame: the picker's last step, and
 * the note an owner who picked before the cutover reads once it applied. The
 * SDK decides when it shows and each org's status ({@link ChoiceDone}).
 * Before the cutover it reads as what each org becomes then; once applied, as
 * what each org is now, with each org's members and activity. The action, the
 * X, Escape and a click outside all close it.
 */
export function DoneStep({
  done,
  onClose,
  until,
  closeLabel,
}: {
  done: ChoiceDone;
  onClose: () => void;
  /**
   * The last day the pick may change, formatted, or null once it can't.
   * Defaults to the window the stored pick answered with.
   */
  until?: string | null;
  closeLabel?: string;
}) {
  const { t, i18n } = useTranslation("plan");
  const orgName = useOrgName();
  // Formatted on render, so an open step follows a language change.
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
      {/* The phone sheet seats the action at the bottom, under the thumb. */}
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta
          label={closeLabel ?? t("choice.done.close")}
          onClick={onClose}
        />
      </div>
    </>
  );
}
