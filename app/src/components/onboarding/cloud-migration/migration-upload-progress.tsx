import type { UploadProgress } from "@houston/engine-adapter";
import { AttachmentProgress } from "@houston-ai/chat";
import { useUploadProgressLabels } from "../../upload-progress-provider";

export function MigrationUploadProgress({
  progress,
  name,
}: {
  progress?: UploadProgress;
  name: string;
}) {
  const labels = useUploadProgressLabels();
  if (!progress || progress.phase === "done") return null;
  return (
    <div className="w-full min-w-0">
      <p className="truncate text-xs text-ink-muted">{name}</p>
      <AttachmentProgress
        name={name}
        labels={labels}
        progress={{
          fraction:
            progress.totalBytes > 0
              ? Math.min(1, progress.sentBytes / progress.totalBytes)
              : 0,
          state: progress.phase,
        }}
      />
    </div>
  );
}
