import {
  type ChoiceDone,
  type ChoiceOrgStatus,
  formatCutoverDate,
  formatCutoverDay,
} from "@houston/sdk";
import { cn, DialogDescription, DialogTitle } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOrgName } from "./free-org-picker-rows";
import { OrgAvatar } from "./org-avatar";
import { PlanBriefingCta } from "./plan-briefing-cta";

const STATUS = {
  free: {
    label: "choice.done.status.free",
    className: "bg-success/12 text-success-ink",
  },
  subscription: {
    label: "choice.done.status.subscription",
    className: "bg-chip-solid text-ink",
  },
  locks: {
    label: "choice.done.status.locks",
    className:
      "text-ink-muted outline outline-1 -outline-offset-1 outline-line",
  },
  needs_plan: {
    label: "choice.done.status.needs_plan",
    className:
      "text-ink-muted outline outline-1 -outline-offset-1 outline-line",
  },
} as const satisfies Record<
  ChoiceOrgStatus,
  { label: `choice.done.status.${ChoiceOrgStatus}`; className: string }
>;

/**
 * The picker's last step once a pick is stored, in the same frame: what each
 * org the person owns becomes at the cutover. The SDK decides when it shows
 * and each org's status ({@link ChoiceDone}); Done, the X, Escape and a click
 * outside all close it.
 */
export function DoneStep({
  done,
  onClose,
}: {
  done: ChoiceDone;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("plan");
  const orgName = useOrgName();
  // Formatted on render, so an open step follows a language change.
  const date = formatCutoverDate(done.cutoverAt, i18n.language);
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
        {t("choice.done.title", { name: orgName(done.free) })}
      </DialogTitle>
      <DialogDescription className="mb-5 text-base leading-normal text-ink-muted">
        {t("choice.done.sub", { date })}
      </DialogDescription>
      <ul className="plan-briefing-stagger ht-hairline mb-3 divide-y divide-line rounded-xl bg-chip px-3.5 py-1">
        {done.orgs.map(({ org, status }) => (
          <li
            key={org.slug}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5"
          >
            <OrgAvatar slug={org.slug} name={orgName(org)} size="sm" />
            <span className="truncate text-sm font-medium text-ink">
              {orgName(org)}
            </span>
            <span
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS[status].className,
              )}
            >
              {t(STATUS[status].label, {
                date: org.lockAt
                  ? formatCutoverDay(org.lockAt, i18n.language)
                  : "",
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mb-6 text-[13px] text-ink-muted">
        {t("choice.done.change")}
      </p>
      {/* The phone sheet seats the action at the bottom, under the thumb. */}
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta label={t("choice.done.close")} onClick={onClose} />
      </div>
    </>
  );
}
