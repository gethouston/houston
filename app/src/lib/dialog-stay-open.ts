/**
 * Keeping a `FormDialog` open after a failure the user can already read.
 *
 * The recipe closes when its primary RESOLVES and stays open when it REJECTS,
 * so a submit that handled its own failure inline ("that key was rejected",
 * "you still belong to a team space") has no other way to say "stay". A plain
 * rejection would reach the global `unhandledrejection` handler, which files
 * the failure as a bug report — wrong twice over: the state is expected, and
 * the layer that produced it already reported whatever was worth reporting.
 *
 * `stayOpen()` rejects with a sentinel that handler recognises and ignores —
 * the same posture as the agent-warming refusal (`agent-warming-guard.ts`):
 * a typed rejection that is a control signal, not an error.
 *
 * `Symbol.for` rather than a class + `instanceof`: the web build composes
 * `app/src` through a second module graph, so only the global registry keeps
 * one identity across both (see `sentry-reported-mark.ts`).
 */
const STAY_OPEN = Symbol.for("houston.formDialog.stayOpen");

/**
 * Reject a `FormDialog` primary WITHOUT reporting anything: the form stays on
 * screen with the user's input intact. Return it from the failure branch that
 * has already surfaced the reason.
 *
 * This is the FAILURE posture. A submit that SUCCEEDED and still has something
 * to show — a minted key's secret, revealed once — resolves `false` instead,
 * which the recipe reads directly and no error path ever sees.
 */
export function stayOpen(): Promise<never> {
  const signal = new Error("form dialog stays open") as Error &
    Record<symbol, unknown>;
  signal[STAY_OPEN] = true;
  return Promise.reject(signal);
}

export function isStayOpenSignal(reason: unknown): boolean {
  return (
    !!reason &&
    typeof reason === "object" &&
    (reason as Record<symbol, unknown>)[STAY_OPEN] === true
  );
}
