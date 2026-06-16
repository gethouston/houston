/**
 * Onboarding step types. The unified "Step N of N" numbering (including the
 * language + agreement gates and the email step) lives in `lib/setup-steps.ts`;
 * the orchestrator only owns these mission steps. Welcome is a hero in the
 * first-run gate and isn't a TutorialStep.
 */
export type OnboardingStep = TutorialStep;

export type TutorialStep =
  | "meet"
  | "brain"
  | "providerLogin"
  | "tools"
  | "email";
