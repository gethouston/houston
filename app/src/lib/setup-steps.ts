/**
 * The numbered first-run steps as ONE flat sequence. First-run reads as a single
 * flow ("Step N of 3"), not two separate phases. A logical step can span more
 * than one screen (e.g. "Connect your AI" is the pick screen + the login screen),
 * so each entry is the set of screen ids that share a step number.
 *
 * The email step pair (connect an inbox, watch the agent send one real email)
 * only exists where the deployment serves the integrations routes. On a
 * no-integrations deployment those screens never render, so they must NOT count
 * toward the "Step N of M" total either — otherwise the sole `connect` step
 * reads "Step 1 of 3" and promises two steps that never come.
 *
 * The language + agreement gates are pre-setup and carry NO step counter, and the
 * framing/celebration screens (intro, the success screens, the finished payoff)
 * sit outside this list too.
 */
const FLOW_STEPS: readonly { screens: readonly string[]; email: boolean }[] = [
  { screens: ["connect"], email: false }, // Step 1 — Connect your AI
  { screens: ["connectEmail"], email: true }, // Connect your email
  { screens: ["emailChat"], email: true }, // Test your personal assistant
];

/**
 * The 1-based position of a screen in the flat first-run sequence, or null for
 * screens that aren't numbered steps (gates, success/celebration screens).
 *
 * `emailSteps` reflects this deployment's capabilities (see
 * `integrationsAvailable`): when false, the email-only steps are excluded from
 * both the position and the total, so the connect step is honestly "Step 1 of 1".
 */
export function stepPosition(
  screen: string,
  { emailSteps }: { emailSteps: boolean },
): { current: number; total: number } | null {
  const steps = FLOW_STEPS.filter((s) => emailSteps || !s.email);
  const index = steps.findIndex((s) => s.screens.includes(screen));
  if (index === -1) return null;
  return { current: index + 1, total: steps.length };
}
