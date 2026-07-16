/**
 * Whether to offer the "skip" escape hatch on the final email onboarding step.
 *
 * The step normally auto-advances when the agent emits the
 * `[TUTORIAL_COMPLETED]` marker. The only escape is the live conversation,
 * and it becomes available only after the offer has sent its first message.
 */
export function shouldOfferSkip(args: {
  /** The email offer successfully started the agent conversation. */
  hasFirstMessage: boolean;
  /** The completion marker was seen (the happy path auto-advances instead). */
  setupDone: boolean;
}): boolean {
  return args.hasFirstMessage && !args.setupDone;
}
