import {
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";

export interface HedgeOptions {
  deadlineMs: number;
  extraAttempts: number;
  signal?: AbortSignal;
  onAttempt?(attempt: number, afterMs: number): void;
  onAnswered?(attempt: number, afterMs: number): void;
}

// WHY: pi runs a tool only after its response finishes, so a hedge never runs one twice. ADR-0007
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
