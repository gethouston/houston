/**
 * Which provider-connection STEPS the user has cancelled.
 *
 * A cancel means "stop watching for this sign-in": a credential that lands
 * afterwards must not resume the conversation behind the user's back. The fact
 * therefore has to outlive the card that recorded it — the chat panel unmounts
 * whenever the user switches conversation, collapses the stepper or reloads, and
 * a per-mount ref forgot it every time, so the rebuilt observer started
 * unpaused and auto-continued on the late sign-in.
 *
 * Keyed by interaction STEP id, which is the unit the user cancelled: a later
 * interaction asking for the same provider is a new request and starts live.
 * Module-level because it belongs to the app run, not to any component, and
 * bounded by the user's own cancels — one entry each, dropped as soon as that
 * step connects or is explicitly restarted.
 */
const cancelledSteps = new Set<string>();

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

/** Drop every recorded cancel. Tests only — the app run owns the real set. */
export function forgetProviderConnectSteps(): void {
  cancelledSteps.clear();
}
