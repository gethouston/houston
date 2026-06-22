/**
 * The single ordered list of numbered setup steps, shared across the gates and
 * the onboarding orchestrator so the "Step N of N" header is consistent
 * everywhere (the totals used to disagree between screens). The rotating
 * Welcome is a hero and sits OUTSIDE this list (unnumbered).
 *
 *   1 language → 2 agreement → 3 meet → 4 brain (pick AI) →
 *   5 providerLogin (connect AI) → 6 tools (apps) → 7 email
 */
export const SETUP_STEPS = [
  "language",
  "agreement",
  "meet",
  "brain",
  "providerLogin",
  "tools",
  "email",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** 1-based position + total for a step, for the "Step N of N" eyebrow. */
export function setupStepNumber(step: SetupStep): {
  current: number;
  total: number;
} {
  return { current: SETUP_STEPS.indexOf(step) + 1, total: SETUP_STEPS.length };
}
