import { Progress } from "@houston-ai/core";
import { createContext } from "react";

export interface AttachmentUploadProgress {
  fraction: number;
  state: "uploading" | "reconnecting" | "saving";
}

export interface AttachmentProgressLabels {
  uploading: string;
  reconnecting: string;
  saving: string;
}

const DEFAULT_LABELS: AttachmentProgressLabels = {
  uploading: "Uploading…",
  reconnecting: "Reconnecting…",
  saving: "Saving…",
};

export const AttachmentProgressContext = createContext<{
  progress: ReadonlyMap<File, AttachmentUploadProgress>;
  labels: AttachmentProgressLabels;
}>({
  progress: new Map(),
  labels: DEFAULT_LABELS,
});

export const AttachmentProgressProvider = AttachmentProgressContext.Provider;

export function AttachmentProgress({
  name,
  progress,
  labels = DEFAULT_LABELS,
}: {
  name: string;
  progress: AttachmentUploadProgress;
  labels?: AttachmentProgressLabels;
}) {
  const percent = Math.round(progress.fraction * 100);
  const label = labels[progress.state];
  return (
    <div className="mt-1 min-w-0">
      <p className="text-xs text-ink-muted tabular-nums">
        <span role="status">{label}</span>
        {progress.state === "uploading" && <> {percent}%</>}
      </p>
      <Progress
        value={percent}
        aria-label={name}
        aria-valuetext={label}
        className="mt-1 h-1 bg-chip [&>[data-slot=progress-indicator]]:transition-transform [&>[data-slot=progress-indicator]]:duration-(--ht-duration-fast) [&>[data-slot=progress-indicator]]:ease-(--ht-easing-entrance) motion-reduce:[&>[data-slot=progress-indicator]]:transition-none"
      />
    </div>
  );
}
