import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ONBOARDING_SEGMENTS,
  type OnboardingSegment,
} from "../../lib/onboarding-survey";
import type { SurveyPillOption } from "./survey-pill-grid";
import type { OnboardingSurveyStep } from "./survey-steps";

export interface SurveyQuestionCopy {
  title: string;
  subtitle: string;
}

export interface SurveyCopy {
  /** Heading + supporting line for the question currently on screen. */
  question: SurveyQuestionCopy;
  segmentOptions: readonly SurveyPillOption<OnboardingSegment>[];
}

/**
 * The survey's translated question copy and job pill labels, in one lookup.
 * The job question keeps the `onboardingSegment.*` keys it shipped with so its
 * copy (and its translations) survive the rewrite untouched; the industry
 * question reads its labels from the hire catalog's own translations
 * (`survey-industry-picker.tsx`).
 */
export function useSurveyCopy(step: OnboardingSurveyStep): SurveyCopy {
  const { t } = useTranslation("setup");

  const segmentOptions = useMemo(() => {
    const labels = t("onboardingSegment.options", {
      returnObjects: true,
    }) as Record<OnboardingSegment, string>;
    return ONBOARDING_SEGMENTS.map((id) => ({ id, label: labels[id] }));
  }, [t]);

  const question = {
    segment: {
      title: t("onboardingSegment.title"),
      subtitle: t("onboardingSegment.subtitle"),
    },
    industry: {
      title: t("onboardingSurvey.industry.title"),
      subtitle: t("onboardingSurvey.industry.subtitle"),
    },
    goal: {
      title: t("onboardingSurvey.goal.title"),
      subtitle: t("onboardingSurvey.goal.subtitle"),
    },
  }[step];

  return { question, segmentOptions };
}
