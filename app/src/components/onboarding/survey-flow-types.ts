import type {
  OnboardingIndustry,
  OnboardingSegment,
} from "../../lib/onboarding-survey";
import type { OnboardingSurveyStep } from "./survey-steps";

/** What `useSurveyFlow` hands the survey screen (see its module doc). */
export interface SurveyFlow {
  /** The question on screen; `undefined` once the plan is exhausted. */
  step: OnboardingSurveyStep | undefined;
  plan: readonly OnboardingSurveyStep[];
  index: number;
  segment: OnboardingSegment | null;
  /** The "Something else" free text for the on-screen closed question. */
  otherText: string;
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
  writeOther: (value: string) => void;
  writeGoal: (value: string) => void;
  submit: () => void;
  back: () => void;
}
