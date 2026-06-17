/**
 * The single ordered list of numbered setup steps, shared across the gates and
 * the onboarding orchestrator so the "Step N of N" header is consistent
 * everywhere (the totals used to disagree between screens). The rotating
 * Welcome hero and the unnumbered framing/celebration screens (intro,
 * setupReady, done) sit OUTSIDE this list.
 *
 * Setup before creation: the account is fully set up (AI + apps) BEFORE the
 * user creates their first agent, so the two phases read distinctly.
 *
 *   1 language → 2 agreement → 3 brain (log in to AI subscription) →
 *   4 providerLogin (log in to provider) → 5 tools (apps) →
 *   6 meet (create your first agent) → 7 email (send first email)
 */
export const SETUP_STEPS = [
  "language",
  "agreement",
  "brain",
  "providerLogin",
  "tools",
  "meet",
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
