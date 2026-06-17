/**
 * Onboarding step types. The unified "Step N of N" numbering (including the
 * language + agreement gates) lives in `lib/setup-steps.ts`; only the numbered
 * actionable steps are `TutorialStep`s. Welcome is a hero in the first-run gate.
 *
 * The orchestrator also renders three UNNUMBERED framing/celebration screens
 * (`intro`, `setupReady`, `done`) which carry no "Step N of N" eyebrow. Flow:
 *   intro → brain (log in to your AI subscription) →
 *   providerLogin (log in to the specific provider) → tools (apps) →
 *   setupReady (setup done ✓) → meet (create your first agent) →
 *   email (send the first real email) → done (all set ✓).
 */
export type OnboardingStep =
  | "intro"
  | TutorialStep
  | "setupReady"
  | "done";

export type TutorialStep =
  | "brain"
  | "providerLogin"
  | "tools"
  | "meet"
  | "email";
