import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { OnboardingSurveyState } from "../../hooks/use-onboarding-survey";
import { ONBOARDING_GOAL_MAX_LENGTH } from "../../lib/onboarding-survey";
import { FirstRunScreen } from "./first-run-screen";
import { SetupCard } from "./setup-card";
import { SkipOnboardingButton } from "./skip-onboarding-button";
import { SurveyAnswer } from "./survey-answer";
import { useSurveyCopy } from "./survey-copy";
import { SurveyFooter } from "./survey-footer";
import { SurveyHeader } from "./survey-header";
import type { OnboardingSurveyMode } from "./survey-steps";
import { useSurveyFlow } from "./use-survey-flow";

interface OnboardingSurveyScreenProps {
  mode: OnboardingSurveyMode;
  /** The app's single `useOnboardingSurvey` instance, passed in rather than
   *  mounted here so the record's catch-up flush runs exactly once. */
  survey: OnboardingSurveyState;
  /** Every question in this mounting's plan has been answered. */
  onComplete: () => void;
  /**
   * The user declined the survey: the support escape hatch in `first_run`,
   * "Not now" in `profile_completion`. The caller owns what declining means
   * (terminal teardown vs. dismissing the prompt).
   */
  onDismiss?: () => void;
}

/** The VALIDATION message's id — the only one a field points at. */
const PROBLEM_ID = "onboarding-survey-problem";

/**
 * The onboarding survey: what the user does, the industry they do it in, and
 * the one thing they would love to automate. Centered hero layout (logo →
 * question → answers → Continue) on Houston's white setup card, the
 * presentation the segmentation screen shipped with.
 *
 * Mounted twice over a user's life: as the first-run intro ahead of the
 * create-your-assistant flow, and as an in-app prompt that fills the gaps for
 * anyone who only ever answered the job question.
 */
export function OnboardingSurveyScreen({
  mode,
  survey,
  onComplete,
  onDismiss,
}: OnboardingSurveyScreenProps) {
  const { t } = useTranslation("setup");
  const flow = useSurveyFlow(mode, survey, onComplete);
  const framed = mode === "profile_completion";
  const copy = useSurveyCopy(flow.step ?? "segment");
  // Two DIFFERENT problems, deliberately not merged. The validation message is
  // about what is in the field, so the field owns it (`aria-invalid` +
  // `aria-describedby`); a failed save is about the request, and marking the
  // textarea invalid because the network dropped would tell a screen-reader
  // user to fix an answer that is perfectly fine.
  const invalid = flow.goalTooLong
    ? t("onboardingSurvey.goal.tooLong", { max: ONBOARDING_GOAL_MAX_LENGTH })
    : null;

  if (!flow.step) return null;

  return (
    <FirstRunScreen>
      <SetupCard>
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center justify-center text-center",
            framed ? "gap-6" : "gap-8",
          )}
        >
          <SurveyHeader
            framed={framed}
            heading={
              framed
                ? {
                    title: t("onboardingSurvey.completion.title"),
                    subtitle: t("onboardingSurvey.completion.subtitle"),
                  }
                : copy.question
            }
            question={copy.question}
            steps={flow.plan}
            current={flow.index}
          />

          <SurveyAnswer
            step={flow.step}
            copy={copy}
            segment={flow.segment}
            industry={flow.industry}
            goal={flow.goal}
            onSegment={flow.chooseSegment}
            onIndustry={flow.chooseIndustry}
            onGoal={flow.writeGoal}
            disabled={flow.saving}
            errorId={invalid ? PROBLEM_ID : null}
          />

          {invalid && (
            <p id={PROBLEM_ID} className="text-xs text-danger" role="alert">
              {invalid}
            </p>
          )}

          {flow.error && (
            <p className="text-xs text-danger" role="alert">
              {flow.error}
            </p>
          )}

          <SurveyFooter
            saving={flow.saving}
            canContinue={flow.canContinue}
            onBack={flow.canGoBack ? flow.back : null}
            onContinue={flow.submit}
            onDismiss={framed ? (onDismiss ?? null) : null}
          />
        </div>
      </SetupCard>
      {mode === "first_run" && onDismiss && (
        <SkipOnboardingButton onSkip={onDismiss} />
      )}
    </FirstRunScreen>
  );
}
