import type { ProviderError, WireEvent } from "@houston/runtime-client";
import type { ModelPhase } from "../backends/model-phase";
import { createRunawayDetector } from "./runaway-output";

// WHY: pi ends an aborted response as stopReason error "This operation was aborted". ADR-0012
export function isAbortEcho(error: ProviderError): boolean {
  return (
    error.kind === "unknown" &&
    /operation was aborted/i.test(error.raw_excerpt ?? "")
  );
}

export interface StallWatchdog {
  arm(): void;
  onEvent(event: WireEvent): void;
  touch(): void;
  onPhase(phase: ModelPhase): void;
  onResponseStart(): void;
  disarm(): void;
}

export type StallReason = "silent" | "unanswered" | "degenerate";

export function createStallWatchdog(opts: {
  timeoutMs: number;
  firstResponseMs?: (provider: string, promptTokens?: number) => number;
  onStall: (reason: StallReason, windowMs: number) => void;
}): StallWatchdog {
  const { timeoutMs, onStall } = opts;
  const runaway = createRunawayDetector();
  let armed = false;
  let tripped = false;
  let toolDepth = 0;
  let phase: ModelPhase = { phase: "idle" };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const trip = (reason: StallReason, windowMs: number) => {
    if (tripped) return;
    tripped = true;
    clear();
    onStall(reason, windowMs);
  };
  const window = (): { ms: number; reason: StallReason } | undefined => {
    const silent = isOn(timeoutMs) ? timeoutMs : undefined;
    const first =
      phase.phase === "requesting"
        ? (opts.firstResponseMs?.(phase.provider, phase.promptTokens) ?? 0)
        : 0;
    if (phase.phase !== "requesting" || !isOn(first))
      return silent === undefined
        ? undefined
        : { ms: silent, reason: "silent" };
    const unanswered = first + (phase.afterMs ?? 0);
    return silent !== undefined && silent <= unanswered
      ? { ms: silent, reason: "silent" }
      : { ms: unanswered, reason: "unanswered" };
  };
  const reset = () => {
    clear();
    if (!armed || tripped || toolDepth > 0) return;
    const next = window();
    if (next) timer = setTimeout(() => trip(next.reason, next.ms), next.ms);
  };

  return {
    arm() {
      armed = true;
      reset();
    },
    onEvent(event) {
      if (event.type === "tool_start") toolDepth++;
      else if (event.type === "tool_end" && toolDepth > 0) toolDepth--;
      else if (
        armed &&
        (event.type === "text" || event.type === "thinking") &&
        runaway.feed(event.type, event.data)
      )
        return trip("degenerate", 0);
      reset();
    },
    touch() {
      reset();
    },
    onPhase(next) {
      phase = next;
      reset();
    },
    onResponseStart() {
      runaway.reset();
    },
    disarm() {
      armed = false;
      clear();
    },
  };
}

function isOn(ms: number): boolean {
  return Number.isFinite(ms) && ms > 0;
}
