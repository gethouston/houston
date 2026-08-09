import { useEffect, useMemo, useRef, useState } from "react";
import type { OnboardingSurveyState } from "../../hooks/use-onboarding-survey";
import { genericErrorDescription } from "../../lib/error-report";
import {
  isOnboardingIndustry,
  isOnboardingSegment,
  isValidAutomationGoal,
  type OnboardingIndustry,
  type OnboardingSegment,
} from "../../lib/onboarding-survey";
import { createSurveyAnalytics } from "./survey-analytics";
import {
  type OnboardingSurveyMode,
  type OnboardingSurveyStep,
  surveyStepPlan,
} from "./survey-steps";

export interface SurveyFlow {
  /** The question on screen; `undefined` once the plan is exhausted. */
  step: OnboardingSurveyStep | undefined;
  plan: readonly OnboardingSurveyStep[];
  index: number;
  segment: OnboardingSegment | null;
  industry: OnboardingIndustry | null;
  goal: string;
  saving: boolean;
  error: string | null;
  /** The typed goal is past the accepted length — a validation state the
   *  screen shows, never a silent drop on save. */
  goalTooLong: boolean;
  canContinue: boolean;
  canGoBack: boolean;
  chooseSegment: (id: OnboardingSegment) => void;
  chooseIndustry: (id: OnboardingIndustry) => void;
  writeGoal: (value: string) => void;
  submit: () => void;
  back: () => void;
}

/**
 * The survey's state machine: which question is showing, what has been picked,
 * and the save-then-advance step that persists each answer. Split from the
 * screen so the card stays pure layout and the progression is readable in one
 * place.
 *
 * `survey` is passed IN, never mounted here: `useOnboardingSurvey` runs a
 * catch-up flush per instance, so App owning the single instance is what keeps
 * one recovery PUT from becoming two.
 *
 * Every question advances on a real answer — no step skips itself. The record
 * still models a skipped goal (`saveGoal(null)` → `goalSkipped`), which is what
 * accounts that took the old per-question link carry; this flow just never
 * writes it.
 */
export function useSurveyFlow(
  mode: OnboardingSurveyMode,
  survey: OnboardingSurveyState,
  onComplete: () => void,
): SurveyFlow {
  const answers = survey.survey;
  // Fixed at mount: every save flips the hook's answered flags, and a live plan
  // would drop the step the user is standing on. Callers only mount the survey
  // once it has loaded, so this first read sees the real answers.
  const [plan] = useState(() => surveyStepPlan(mode, survey));
  const [index, setIndex] = useState(0);
  const [segment, setSegment] = useState<OnboardingSegment | null>(() =>
    answers && isOnboardingSegment(answers.segment) ? answers.segment : null,
  );
  const [industry, setIndustry] = useState<OnboardingIndustry | null>(() =>
    answers && isOnboardingIndustry(answers.industry) ? answers.industry : null,
  );
  const [goal, setGoal] = useState(() => answers?.automationGoal ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = plan[index];
  const track = useMemo(() => createSurveyAnalytics(mode), [mode]);

  useEffect(() => {
    if (step) track.stepViewed(step);
  }, [step, track]);

  // The in-app prompt reports the gaps it interrupted for, so "who sees this,
  // and for what" is answerable without joining events.
  useEffect(() => {
    if (mode === "profile_completion") track.prompted(plan);
  }, [mode, plan, track]);

  // Running off the end of the plan is the single completion path: the last
  // Continue advances into it, and a plan with nothing left to ask finishes on
  // mount instead of rendering an empty card.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (step || finishedRef.current) return;
    finishedRef.current = true;
    onComplete();
  }, [step, onComplete]);

  const goalText = goal.trim();
  // The length rule is the record's, measured in code points exactly as the
  // gateway measures it, and it is the ONLY guard: the textarea is deliberately
  // unclamped (`survey-answer.tsx`), so over-cap text stays on screen and says
  // so rather than being silently truncated to something that validates clean.
  const goalValid = isValidAutomationGoal(goal);
  const goalTooLong = goalText.length > 0 && !goalValid;

  // A save is a user-initiated write, and `saveGoal` DOES reject on a goal the
  // record refuses: the reason surfaces here instead of the answer vanishing
  // with Continue silently refusing to advance.
  const save = async (persist: () => Promise<void>, confirmed: () => void) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await persist();
      confirmed();
      setIndex((i) => i + 1);
    } catch (err) {
      setError(genericErrorDescription("save_onboarding_survey", err));
    } finally {
      setSaving(false);
    }
  };

  return {
    step,
    plan,
    index,
    segment,
    industry,
    goal,
    saving,
    error,
    goalTooLong,
    canContinue:
      step === "segment"
        ? segment !== null
        : step === "industry"
          ? industry !== null
          : goalValid,
    canGoBack: index > 0,
    chooseSegment: (id) => {
      setSegment(id);
      setError(null);
      track.segmentSelected(id);
    },
    chooseIndustry: (id) => {
      setIndustry(id);
      setError(null);
      track.industrySelected(id);
    },
    // Editing clears a previous SAVE failure, exactly as picking a pill does:
    // it belongs to the attempt the user has now moved on from, and leaving it
    // up would stack it under a live validation problem.
    writeGoal: (value) => {
      setGoal(value);
      setError(null);
    },
    submit: () => {
      if (step === "segment" && segment) {
        void save(
          () => survey.saveSegment(segment),
          () => track.segmentContinued(segment),
        );
      } else if (step === "industry" && industry) {
        void save(
          () => survey.saveIndustry(industry),
          () => track.industryContinued(industry),
        );
      } else if (step === "goal" && goalValid) {
        void save(
          () => survey.saveGoal(goalText),
          () => track.goalContinued(goalText),
        );
      }
    },
    back: () => {
      setError(null);
      setIndex((i) => Math.max(0, i - 1));
    },
  };
}
