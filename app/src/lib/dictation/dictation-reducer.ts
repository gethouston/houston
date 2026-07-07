/**
 * Pure state machine for the composer's dictation control. Mirrors
 * `DictationState` from `@houston-ai/chat` exactly (idle | requesting |
 * recording | transcribing) so `use-dictation.ts` can hand `state` straight
 * through to `DictationControl`. Kept separate from the hook so the
 * transitions (including error paths and the 120s auto-stop) are unit
 * testable without a DOM/React runner (`app/tests/dictation-reducer.test.ts`).
 *
 * The model-download consent dialog is deliberately NOT part of this
 * machine: per contract, `DictationControl.state` stays "idle" while that
 * dialog is open (nothing is being captured yet) — `use-dictation.ts` tracks
 * it as separate `modelSetup` state.
 */

export type DictationPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing";

export interface DictationMachineState {
  phase: DictationPhase;
  /** Epoch ms capture began. Set on `micGranted`, cleared once idle again. */
  recordingStartedAt?: number;
}

export type DictationEvent =
  | { type: "start" }
  | { type: "micGranted"; startedAt: number }
  | { type: "micFailed" }
  | { type: "stop" }
  | { type: "autoStop" }
  | { type: "cancel" }
  | { type: "transcribeSettled" }
  | { type: "reset" };

export const INITIAL_DICTATION_STATE: DictationMachineState = { phase: "idle" };

/**
 * Advance the machine. Events that don't apply to the current phase are
 * no-ops (returns the same reference) rather than throwing — a stray
 * `micGranted` after the user already cancelled, or a `cancel` while
 * transcribing (there's nothing left to discard), must not crash the
 * composer.
 */
export function dictationReducer(
  state: DictationMachineState,
  event: DictationEvent,
): DictationMachineState {
  switch (event.type) {
    case "start":
      return state.phase === "idle" ? { phase: "requesting" } : state;

    case "micGranted":
      return state.phase === "requesting"
        ? { phase: "recording", recordingStartedAt: event.startedAt }
        : state;

    case "micFailed":
      return state.phase === "requesting" ? { phase: "idle" } : state;

    case "stop":
    case "autoStop":
      return state.phase === "recording" ? { phase: "transcribing" } : state;

    case "cancel":
      return state.phase === "requesting" || state.phase === "recording"
        ? { phase: "idle" }
        : state;

    case "transcribeSettled":
      return state.phase === "transcribing" ? { phase: "idle" } : state;

    case "reset":
      return state.phase === "idle" ? state : { phase: "idle" };

    default:
      return state;
  }
}
