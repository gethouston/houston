import type { ProviderError, WireEvent } from "@houston/runtime-client";
import type { ModelPhase } from "../backends/types";
import { createRunawayDetector } from "./runaway-output";

/**
 * Whether a provider_error frame is our OWN abort coming back: pi does not
 * resolve an aborted request as a neutral `aborted` turn when the abort lands
 * while the response is still pending — it ends the assistant message with
 * stopReason `error` and the AbortError's text ("This operation was aborted")
 * as the reason, which the classifier can only call `unknown`. Letting that
 * frame stand painted "Houston could not classify this Azure OpenAI error"
 * over a turn the watchdog cut for silence (PRODUCT-1778); the turn's honest
 * surface is the synthesized "stopped responding" card (or, for a user Stop,
 * the "Stopped by user" frame). Only ever consulted for an abort THIS turn
 * issued — a genuine provider abort on an untouched turn still surfaces.
 */
export function isAbortEcho(error: ProviderError): boolean {
  return (
    error.kind === "unknown" &&
    /operation was aborted/i.test(error.raw_excerpt ?? "")
  );
}

/**
 * Guards a turn's model round-trip against a provider that goes silent, never
 * answers, or loops.
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
 * Three trips (`StallReason`):
 * - `silent`: no event for `timeoutMs`. A reasoning model may think silently for
 *   minutes after its response opens, so this window is long.
 * - `unanswered`: a request whose response never opened, for
 *   `firstResponseMs(provider)` (fed by `onPhase`). A provider that has not
 *   even sent its response headers is not thinking. The hedge
 *   (ai/hedged-runtime.ts) sends such a request again first; this window is
 *   the backstop once every attempt has had its deadline (ai/first-byte.ts).
 * - `degenerate`: the reply turned into a repetition loop (runaway-output.ts).
 *
 * Timer-library-agnostic (plain `setTimeout`/`clearTimeout`) so tests drive it
 * with fake timers and no live session. A window `<= 0` (or non-finite) is off —
 * a fail-safe: a misconfigured timeout never fires a false abort. It trips at
 * most once.
 */
export interface StallWatchdog {
  /** Begin watching (call right before awaiting the model). */
  arm(): void;
  /** Feed one wire event: resets the idle clock, tracks tool depth. */
  onEvent(event: WireEvent): void;
  /**
   * Proof of life with no wire event behind it: resets the idle clock only.
   * Fed by the backend's liveness channel (`HarnessSession.subscribeLiveness`)
   * — a tool call's streamed input reaches the wire as nothing until the call
   * completes, so a model writing a large file would otherwise look dead.
   */
  touch(): void;
  /** Feed a round-trip boundary (`HarnessSession.subscribeModelPhase`). */
  onPhase(phase: ModelPhase): void;
  /**
   * A new assistant message starts (`subscribeAssistantMessageStart`, which
   * every backend implements): the loop check starts over, so short replies
   * that each say the same thing never add up to a loop.
   */
  onResponseStart(): void;
  /** Stop watching + clear any pending timer (call in a `finally`). Idempotent. */
  disarm(): void;
}

export type StallReason = "silent" | "unanswered" | "degenerate";

export function createStallWatchdog(opts: {
  timeoutMs: number;
  /** The `unanswered` window for a request to `provider`; 0 = none. */
  firstResponseMs?: (provider: string) => number;
  /** Fired once, with the reason and the window that elapsed (0 for a loop). */
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
  // The window that applies now: the shorter of the quiet-stream one and,
  // while a request waits for its response, the first-response one.
  const window = (): { ms: number; reason: StallReason } | undefined => {
    const silent = isOn(timeoutMs) ? timeoutMs : undefined;
    const first =
      phase.phase === "requesting"
        ? (opts.firstResponseMs?.(phase.provider) ?? 0)
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
  // (Re)start the idle clock — unless disabled, disarmed, tripped, or a tool is in flight.
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
