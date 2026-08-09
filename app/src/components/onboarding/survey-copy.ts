import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ONBOARDING_INDUSTRIES,
  ONBOARDING_SEGMENTS,
  type OnboardingIndustry,
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
  industryOptions: readonly SurveyPillOption<OnboardingIndustry>[];
}

/**
 * The survey's translated question copy and pill labels, in one lookup. The
 * job question keeps the `onboardingSegment.*` keys it shipped with so its copy
 * (and its translations) survive the rewrite untouched.
 */
export function useSurveyCopy(step: OnboardingSurveyStep): SurveyCopy {
  const { t } = useTranslation("setup");

  const segmentOptions = useMemo(() => {
    const labels = t("onboardingSegment.options", {
      returnObjects: true,
    }) as Record<OnboardingSegment, string>;
    return ONBOARDING_SEGMENTS.map((id) => ({ id, label: labels[id] }));
  }, [t]);

  const industryOptions = useMemo(() => {
    const labels = t("onboardingSurvey.industry.options", {
      returnObjects: true,
    }) as Record<OnboardingIndustry, string>;
    return ONBOARDING_INDUSTRIES.map((id) => ({ id, label: labels[id] }));
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

  return { question, segmentOptions, industryOptions };
}
