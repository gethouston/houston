/**
 * Contract for the composer's dictation affordance. The library renders a
 * prop-driven mic / recording / transcribing control; all speech capture and
 * transcription lives in the app (props only, no store, no i18n here).
 *
 * The pure helpers (`resolveDictationView`, `formatElapsed`, ...) hold the
 * state -> render decision so it can be unit-tested without a DOM runner.
 */

export type DictationState =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing";

/** English defaults live in the app; consumers pass `t()` results in. */
export interface DictationLabels {
  start: string;
  stop: string;
  cancel: string;
  recording: string;
  transcribing: string;
}

export interface DictationControl {
  state: DictationState;
  /** Epoch ms the capture began; the UI computes mm:ss locally off it. */
  recordingStartedAt?: number;
  onStart: () => void;
  /** Stop recording and begin transcribing. */
  onStop: () => void;
  /** Discard the capture (Escape / cancel affordance). */
  onCancel: () => void;
  /**
   * Live amplitude history for the recording waveform: one value per 100ms
   * bucket, each normalized 0..1 (0 = silence, 1 = loud). Polled with rAF while
   * recording, so it MUST be cheap and side-effect free (no re-render, no
   * allocation-per-call beyond the array). Absent (or `[]`) renders a bare,
   * bar-less track — the composer degrades gracefully.
   */
  getLevels?: () => readonly number[];
  labels: DictationLabels;
}

/** English fallbacks for apps that don't localize dictation yet. No em dashes. */
export const DEFAULT_DICTATION_LABELS: DictationLabels = {
  start: "Dictate",
  stop: "Stop recording",
  cancel: "Cancel dictation",
  recording: "Recording",
  transcribing: "Transcribing",
};

/**
 * Which affordance the composer should render for the current control.
 * `requesting` is distinct from `recording`: the mic is being granted, so the
 * track shows an empty (all-dots) pulse with no live bars yet.
 */
export type DictationView =
  | { kind: "hidden" }
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "recording"; startedAt?: number }
  | { kind: "transcribing" };

/** True while the composer's input row is taken over by the waveform. */
export function isDictationActive(control?: DictationControl): boolean {
  return isDictationBusy(control);
}

/**
 * Maps a (possibly absent) control to the single affordance to render.
 * `undefined` -> hidden (the web build passes no control at all).
 */
export function resolveDictationView(
  control?: DictationControl,
): DictationView {
  if (!control) return { kind: "hidden" };
  switch (control.state) {
    case "idle":
      return { kind: "idle" };
    case "requesting":
      return { kind: "requesting" };
    case "recording":
      return { kind: "recording", startedAt: control.recordingStartedAt };
    case "transcribing":
      return { kind: "transcribing" };
  }
}

/** True while a capture/transcription is in flight — submit must be disabled. */
export function isDictationBusy(control?: DictationControl): boolean {
  return control !== undefined && control.state !== "idle";
}

/**
 * True while audio is being captured (requesting or recording). Escape
 * discards the capture only in these states; during transcribing there is
 * nothing to cancel.
 */
export function isDictationCapturing(control?: DictationControl): boolean {
  return (
    control !== undefined &&
    (control.state === "requesting" || control.state === "recording")
  );
}

/**
 * mm:ss elapsed between `startedAt` and `now` (both epoch ms). Returns 0:00
 * when the capture hasn't started (requesting) or the clock is behind.
 */
export function formatElapsed(
  startedAt: number | undefined,
  now: number,
): string {
  if (startedAt === undefined) return "0:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
