export type DictationState =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing";

export interface DictationLabels {
  start: string;
  stop: string;
  cancel: string;
  recording: string;
  transcribing: string;
}

export interface DictationControl {
  state: DictationState;
  recordingStartedAt?: number;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  getLevels?: () => readonly number[];
  labels: DictationLabels;
}

export const DEFAULT_DICTATION_LABELS: DictationLabels = {
  start: "Dictate",
  stop: "Stop recording",
  cancel: "Cancel dictation",
  recording: "Recording",
  transcribing: "Transcribing",
};

export type DictationView =
  | { kind: "hidden" }
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "recording"; startedAt?: number }
  | { kind: "transcribing" };

export function isDictationActive(control?: DictationControl): boolean {
  return isDictationBusy(control);
}

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

export function isDictationBusy(control?: DictationControl): boolean {
  return control !== undefined && control.state !== "idle";
}

export function isDictationCapturing(control?: DictationControl): boolean {
  return (
    control !== undefined &&
    (control.state === "requesting" || control.state === "recording")
  );
}

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
