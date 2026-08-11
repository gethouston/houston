import { Input, Textarea } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type {
  OnboardingIndustry,
  OnboardingSegment,
} from "../../lib/onboarding-survey";
import type { SurveyCopy } from "./survey-copy";
import { SurveyPillGrid } from "./survey-pill-grid";
import type { OnboardingSurveyStep } from "./survey-steps";

/**
 * The control the current question is answered with: the shared pill grid for
 * the two closed questions, a plain free-text field for the automation goal.
 *
 * The goal field is deliberately UNCLAMPED. `maxLength` counts UTF-16 units
 * and the record counts code points, so ANY clamp within reach of the limit
 * silently swallows the tail of an over-cap emoji paste and hands back
 * something that then validates clean: 2500 emoji arrived as exactly 2000 code
 * points, 500 of the user's characters gone with no alert. The code-point rule
 * (`isValidAutomationGoal`) is the single authority — over-cap text stays on
 * screen, says so, and holds Continue disabled until it is shortened.
 */
export function SurveyAnswer({
  step,
  copy,
  segment,
  industry,
  goal,
  otherText,
  onSegment,
  onIndustry,
  onOther,
  onGoal,
  disabled,
  errorId,
}: {
  step: OnboardingSurveyStep;
  copy: SurveyCopy;
  segment: OnboardingSegment | null;
  industry: OnboardingIndustry | null;
  goal: string;
  /** The "Something else" free text for the on-screen closed question. */
  otherText: string;
  onSegment: (id: OnboardingSegment) => void;
  onIndustry: (id: OnboardingIndustry) => void;
  onOther: (value: string) => void;
  onGoal: (value: string) => void;
  disabled: boolean;
  /** The id of the live problem message, or null when there is none: it marks
   *  the field invalid AND names the reason for a screen reader. */
  errorId: string | null;
}) {
  const { t } = useTranslation("setup");

  // "Something else" is a door, not an answer: picking it opens a field that
  // captures what it stands for (Continue holds until it is filled).
  const otherField = (
    <Input
      autoFocus
      value={otherText}
      onChange={(e) => onOther(e.target.value)}
      disabled={disabled}
      placeholder={t("onboardingSurvey.otherPlaceholder")}
      aria-label={t("onboardingSurvey.otherPlaceholder")}
      className="mt-4 w-full max-w-sm rounded-full text-center text-base md:text-base"
    />
  );

  if (step === "segment") {
    return (
      <div className="flex w-full flex-col items-center">
        <SurveyPillGrid
          options={copy.segmentOptions}
          selected={segment}
          onSelect={onSegment}
          disabled={disabled}
        />
        {segment === "something_else" && otherField}
      </div>
    );
  }

  if (step === "industry") {
    return (
      <div className="flex w-full flex-col items-center">
        <SurveyPillGrid
          options={copy.industryOptions}
          selected={industry}
          onSelect={onIndustry}
          disabled={disabled}
        />
        {industry === "something_else" && otherField}
      </div>
    );
  }

  return (
    <Textarea
      value={goal}
      onChange={(e) => onGoal(e.target.value)}
      rows={5}
      disabled={disabled}
      aria-label={copy.question.title}
      aria-invalid={errorId !== null}
      aria-describedby={errorId ?? undefined}
      placeholder={t("onboardingSurvey.goal.placeholder")}
      // A hero field, not a form row: the recessed fill and the pills' radius
      // on the white card, and 16px type at every width (the primitive drops to
      // 14px from `md` up, which reads as a settings input here).
      className="min-h-32 w-full max-w-xl resize-none rounded-xl bg-input p-4 text-left text-base md:text-base"
    />
  );
}
