/**
 * Whether to offer the "skip" escape hatch on the final email onboarding step.
 *
 * The step normally auto-advances when the agent emits the
 * `[TUTORIAL_COMPLETED]` marker. Some models (e.g. gpt-5.5) send the email but
 * never emit the marker, leaving the user stuck with no forward affordance
 * (HOU-555). We surface the skip ONLY once the agent has actually run and gone
 * idle WITHOUT confirming completion, so we never nudge people to bail
 * mid-send or before they have even tried.
 */
export function shouldOfferSkip(args: {
  /** The mission session has gone active at least once (the agent ran). */
  hasRun: boolean;
  /** The agent's session is currently working. */
  isActive: boolean;
  /** The completion marker was seen (the happy path auto-advances instead). */
  setupDone: boolean;
}): boolean {
  return args.hasRun && !args.isActive && !args.setupDone;
}
