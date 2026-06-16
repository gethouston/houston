import type { MissionMeta } from "./mission-frame";

/**
 * Onboarding state machine. `welcome` sits OUTSIDE the mission counter — it's
 * the decision point ("do the tutorial or skip"). Once the user starts, the
 * mission stages drive the HUD `Mission N of N` counter.
 */
export type OnboardingStep = "welcome" | TutorialStep;

export type TutorialStep = "meet" | "brain" | "email";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const TUTORIAL_STEPS: TutorialStep[] = ["meet", "brain", "email"];

export function buildMissionMeta(t: Translate, step: TutorialStep): MissionMeta {
  const index = TUTORIAL_STEPS.indexOf(step);
  const total = TUTORIAL_STEPS.length;
  const next = TUTORIAL_STEPS[index + 1];
  const nextTitle = next ? t(`setup:tutorial.missions.${next}.title`) : null;
  return {
    index,
    total,
    eyebrow: t("setup:tutorial.eyebrow", { number: index + 1 }),
    title: t(`setup:tutorial.missions.${step}.title`),
    body: t(`setup:tutorial.missions.${step}.body`),
    nextTitle,
  };
}

export function buildFrameLabels(t: Translate, step: TutorialStep) {
  const index = TUTORIAL_STEPS.indexOf(step);
  return {
    brandLabel: t("setup:tutorial.brand"),
    counterLabel: t("setup:tutorial.counter", {
      current: index + 1,
      total: TUTORIAL_STEPS.length,
    }),
    upNextLabel: t("setup:tutorial.upNext"),
  };
}
