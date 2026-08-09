import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "../shell/experience-card";
import type { SurveyQuestionCopy } from "./survey-copy";

/**
 * The top band of the survey card: the mark, the headline, and where the user
 * stands. In the first-run intro the headline IS the question. The in-app
 * prompt keeps its own framing headline instead, so the question introduces
 * itself on a second line under the progress dots.
 */
export function SurveyHeader({
  framed,
  heading,
  question,
  steps,
  current,
}: {
  framed: boolean;
  heading: SurveyQuestionCopy;
  question: SurveyQuestionCopy;
  steps: readonly string[];
  current: number;
}) {
  const { t } = useTranslation("setup");
  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <HoustonLogo size={framed ? 44 : 52} />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {heading.title}
          </h1>
          <p className="max-w-md text-sm text-ink-muted">{heading.subtitle}</p>
        </div>
      </div>

      {steps.length > 1 && (
        <ProgressDots
          steps={steps}
          current={current}
          label={t("onboardingSurvey.progress.label", {
            current: current + 1,
            total: steps.length,
          })}
        />
      )}

      {framed && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-ink">{question.title}</p>
          <p className="text-xs text-ink-muted">{question.subtitle}</p>
        </div>
      )}
    </>
  );
}

/**
 * One dot per question, the current one drawn as a wider bar. Monochrome and
 * static (no per-frame width animation). The dots are decoration; the spoken
 * "Step 2 of 3" rides alongside them, so the position is never shape-only for
 * a screen reader.
 */
function ProgressDots({
  steps,
  current,
  label,
}: {
  steps: readonly string[];
  current: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      {steps.map((step, position) => (
        <span
          key={step}
          aria-hidden="true"
          className={cn(
            "h-1.5 rounded-full",
            position === current ? "w-6 bg-ink" : "w-1.5 bg-ink/20",
          )}
        />
      ))}
    </div>
  );
}
