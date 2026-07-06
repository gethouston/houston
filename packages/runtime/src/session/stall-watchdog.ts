import type { WireEvent } from "@houston/runtime-client";

/**
 * Guards a turn's model round-trip against a provider that goes silent — an SSE
 * read that never returns another byte and so never resolves `prompt()`.
 *
 * pi resolves a turn on success or a provider_error frame, but a stalled stream
 * resolves NEITHER and emits nothing. pi's SSE reader has no idle timeout (only
 * its WebSocket transport does), so without an external nudge the turn holds the
 * per-workspace workdir lock until the OS socket finally dies — 19 minutes in the
 * production incident, freezing every queued turn on the agent behind it.
 *
 * The watchdog is armed for the model round-trip only and reset by every wire
 * event: a healthy turn streams text/thinking/tool events continuously, so it
 * never trips; a genuinely silent stream does. Tool execution is EXEMPT — a long
 * `bash`/build is legitimately silent — so the clock is suspended while ≥1 tool
 * runs (tracked by `tool_start`/`tool_end`) and re-armed when the last one ends.
 *
 * Timer-library-agnostic (plain `setTimeout`/`clearTimeout`) so tests drive it
 * with fake timers and no live session. `timeoutMs <= 0` (or non-finite) disables
 * it entirely — a fail-safe: a misconfigured timeout never fires a false abort.
 */
export interface StallWatchdog {
  /** Begin watching (call right before awaiting the model). */
  arm(): void;
  /** Feed one wire event: resets the idle clock, tracks tool depth. */
  onEvent(event: WireEvent): void;
  /** Stop watching + clear any pending timer (call in a `finally`). Idempotent. */
  disarm(): void;
}

export function createStallWatchdog(opts: {
  timeoutMs: number;
  /** Fired once when the idle window elapses while armed and no tool is running. */
  onStall: () => void;
}): StallWatchdog {
  const { timeoutMs, onStall } = opts;
  const enabled = Number.isFinite(timeoutMs) && timeoutMs > 0;
  let armed = false;
  let toolDepth = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  // (Re)start the idle clock — unless disabled, disarmed, or a tool is in flight.
  const reset = () => {
    clear();
    if (!enabled || !armed || toolDepth > 0) return;
    timer = setTimeout(onStall, timeoutMs);
  };

  return {
    arm() {
      armed = true;
      reset();
    },
    onEvent(event) {
      if (event.type === "tool_start") toolDepth++;
      else if (event.type === "tool_end" && toolDepth > 0) toolDepth--;
      reset();
    },
    disarm() {
      armed = false;
      clear();
    },
  };
}
