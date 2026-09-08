// Explicit `.ts` extension and no imports at all: the app's node:test runner
// loads this module directly (app/tests/chat-error-reporting.test.ts), and
// `lib/error-report.ts` itself cannot be loaded there (it pulls in i18n, which
// imports every locale JSON). The reporter is therefore a PARAMETER, not an
// import — which is also what keeps this a rule rather than a wrapper.

/** How a failure is reported: `logAndReportError` in the app (frontend log +
 *  Sentry), a recorder in a test. */
export type RejectionReporter = (command: string, err: unknown) => void;

/**
 * Attach the reporting path to a fire-and-forget promise.
 *
 * The banned shape this replaces is a handler that starts background work and
 * walks away: a rejection with no `catch` reaches nothing but the global
 * handler, and one with a bare `console.error` reaches no crash report at all.
 * `command` names the work, so the report says which write failed rather than
 * only that something did.
 */
export function reportRejection(
  work: Promise<unknown>,
  command: string,
  report: RejectionReporter,
): void {
  void work.catch((err: unknown) => report(command, err));
}
