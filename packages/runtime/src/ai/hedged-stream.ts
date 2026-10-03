import {
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";

export interface HedgeOptions {
  /** How long an attempt may wait for its response to open before another goes out. */
  deadlineMs: number;
  /** Attempts beyond the first, at most. */
  extraAttempts: number;
  /** The caller's own cancel (a Stop, the stall watchdog): ends every attempt. */
  signal?: AbortSignal;
  /** Attempt `attempt` (2 for the first hedge) went out, `afterMs` after the first. */
  onAttempt?(attempt: number, afterMs: number): void;
  /** Attempt `attempt`'s response opened first, `afterMs` after the first went out. */
  onAnswered?(attempt: number, afterMs: number): void;
}

/**
 * One model request that survives a provider that never answers it. When the
 * response has not opened (no event at all: pi's `start` follows the HTTP
 * headers or the first WebSocket event) within `deadlineMs`, the same request
 * goes out again while the first keeps waiting, at most `extraAttempts`
 * times. The first attempt to produce an event wins and every other is
 * cancelled, so the caller sees exactly one attempt's events.
 *
 * Sending again is safe: nothing has happened yet. A request that never got
 * its first byte produced no output, and pi runs a tool only after the
 * response that asked for it has finished.
 *
 * An attempt that fails before answering (a 429, a refused key) yields while
 * another attempt is still in flight; otherwise its failure is the answer, as
 * it is without a hedge, and pi's own retry takes it from there. No hedge goes
 * out after a failure: the deadline only covers silence.
 */
export function hedgedStream(
  open: (signal: AbortSignal) => AssistantMessageEventStream,
  options: HedgeOptions,
): AssistantMessageEventStream {
  const out = createAssistantMessageEventStream();
  const attempts: { controller: AbortController; settled: boolean }[] = [];
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  let winner = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const inFlight = (except: number) =>
    attempts.some((attempt, i) => i !== except && !attempt.settled);
  const cancelAll = (keep = -1) => {
    clearTimeout(timer);
    attempts.forEach((attempt, i) => {
      if (i !== keep) attempt.controller.abort();
    });
  };
  const onCallerAbort = () => cancelAll();
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });

  const pump = async (index: number, stream: AssistantMessageEventStream) => {
    const attempt = attempts[index];
    try {
      for await (const event of stream) {
        if (winner === -1) {
          if (event.type === "error" && inFlight(index)) {
            if (attempt) attempt.settled = true;
            return;
          }
          winner = index;
          cancelAll(index);
          options.onAnswered?.(index + 1, elapsed());
        }
        if (winner !== index) return;
        out.push(event);
      }
    } finally {
      if (attempt) attempt.settled = true;
      if (winner === index) {
        options.signal?.removeEventListener("abort", onCallerAbort);
        out.end();
      }
    }
  };

  const launch = () => {
    const index = attempts.length;
    const controller = new AbortController();
    if (options.signal?.aborted) controller.abort();
    attempts.push({ controller, settled: false });
    if (index > 0) options.onAttempt?.(index + 1, elapsed());
    if (index < options.extraAttempts && !options.signal?.aborted)
      timer = setTimeout(() => {
        if (winner === -1) launch();
      }, options.deadlineMs);
    let stream: AssistantMessageEventStream;
    try {
      stream = open(controller.signal);
    } catch (error) {
      controller.abort();
      const failed = attempts[index];
      if (failed) failed.settled = true;
      // The first attempt throws as the request alone would, leaving nothing
      // behind; a hedge that cannot even start leaves the others to answer.
      if (index === 0) {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onCallerAbort);
        throw error;
      }
      return;
    }
    void pump(index, stream);
  };
  launch();
  return out;
}
