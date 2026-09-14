/**
 * What the app remembers about a provider-connection STEP across every card
 * that renders it.
 *
 * Both facts here have to outlive the card that recorded them — the chat panel
 * unmounts whenever the user switches conversation, collapses the stepper or
 * reloads, and the step comes back because the interaction is persisted (on the
 * agent's reply and on the board card). A per-mount ref forgot on every rebuild.
 *
 * Keyed by interaction STEP id, which is the unit the user acted on: a later
 * interaction asking for the same provider is a new request and starts live.
 * Module-level because both belong to the app run, not to any component, and
 * bounded by the user's own steps — one entry each.
 */

/**
 * Steps the user cancelled. A cancel means "stop watching for this sign-in": a
 * credential that lands afterwards must not resume the conversation behind the
 * user's back, so a rebuilt observer starts paused. Dropped as soon as that
 * step connects or is explicitly restarted.
 */
const cancelledSteps = new Set<string>();

/**
 * Steps whose connection ALREADY resumed the conversation. The nudge is the
 * user's one answer to the request; a card rebuilt afterwards finds the
 * provider connected and would send it again, once per rebuild — and each
 * resume is a turn, whose refetch rebuilds the card, so the agent was nudged
 * in a loop (mission surface, Sep 2026).
 */
const resumedSteps = new Set<string>();

/** Stop observing this step until the user explicitly asks again. */
export function cancelProviderConnectStep(stepId: string): void {
  cancelledSteps.add(stepId);
}

/** The user pressed Connect again (or the step completed): watch it once more. */
export function resumeProviderConnectStep(stepId: string): void {
  cancelledSteps.delete(stepId);
}

/** Whether a rebuilt observer for this step must start paused. */
export function providerConnectStepCancelled(stepId: string): boolean {
  return cancelledSteps.has(stepId);
}

/**
 * Claim this step's ONE resume of the conversation: true for the card that gets
 * there first, false for every card rebuilt after it.
 */
export function claimProviderConnectStepResume(stepId: string): boolean {
  if (resumedSteps.has(stepId)) return false;
  resumedSteps.add(stepId);
  return true;
}

/** Drop every recorded step. Tests only — the app run owns the real sets. */
export function forgetProviderConnectSteps(): void {
  cancelledSteps.clear();
  resumedSteps.clear();
}
