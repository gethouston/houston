export type DictationPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing";

export interface DictationMachineState {
  phase: DictationPhase;
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
