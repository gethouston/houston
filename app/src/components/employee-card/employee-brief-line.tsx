import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_CONTEXT_IDS } from "../../lib/agent-role-catalog";
import {
  choiceIdForLabel,
  type JobBriefField,
} from "../context/job-brief-model";
import { JobBriefQuestion } from "../context/job-brief-question";

/** The question stops at its own frame: an answer confirmed with Enter must
 *  never also submit the card's form, which React bubbles it into through the
 *  portal. */
const keepSubmitInside = (event: FormEvent) => event.stopPropagation();

export function EmployeeBriefLine({
  field,
  value,
  industry,
  onAnswer,
}: {
  field: JobBriefField;
  /** The answer on the card, as the person reads it. */
  value: string;
  /** The card's industry, which leads the job question's runs. */
  industry: string;
  onAnswer: (answer: string) => void;
}) {
  const { t } = useTranslation(["agentOnboarding", "agents"]);
  const [open, setOpen] = useState(false);
  const isIndustry = field === "industry";
  const industryId = choiceIdForLabel(
    AGENT_CONTEXT_IDS,
    (id) => t(`agentOnboarding:roleSetup.contexts.${id}`),
    industry,
  );
  const title = t(
    isIndustry
      ? "agentOnboarding:roleSetup.steps.context"
      : "agentOnboarding:roleSetup.steps.role",
  );
  const placeholder = t(
    isIndustry
      ? "agents:instructions.brief.addIndustry"
      : "agents:instructions.brief.addRole",
  );

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            value
              ? t(
                  isIndustry
                    ? "agentOnboarding:roleSetup.customize.changeIndustry"
                    : "agentOnboarding:roleSetup.customize.changeRole",
                  { answer: value },
                )
              : placeholder
          }
          className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-input px-3 py-2 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-ink/70">{title}</span>
            <span
              className="break-words text-sm text-ink"
              title={value || placeholder}
            >
              {value || placeholder}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-muted"
          />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title={title}
        aria-label={title}
        align="start"
        className="max-h-(--radix-popover-content-available-height) w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border-line p-4 shadow-lg dark:shadow-none"
      >
        <div onSubmit={keepSubmitInside} className="px-4 pb-4 md:p-0">
          <JobBriefQuestion
            compact
            field={field}
            current={value || null}
            industryId={industryId}
            onAnswer={(answer) => {
              onAnswer(answer);
              setOpen(false);
            }}
          />
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
