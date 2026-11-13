import type { UploadProgress } from "@houston/engine-adapter";
import { Progress } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function MigrationUploadProgress({
  progress,
  name,
}: {
  progress?: UploadProgress;
  name: string;
}) {
  const { t } = useTranslation("chat");
  if (!progress || progress.phase === "done") return null;
  const percent =
    progress.totalBytes > 0
      ? Math.round((progress.sentBytes / progress.totalBytes) * 100)
      : 0;
  const label = t(`composer.uploadProgress.${progress.phase}`);
  return (
    <div className="w-full min-w-0">
      <p className="truncate text-xs text-ink-muted">{name}</p>
      <p className="text-xs text-ink-muted tabular-nums">
        <span role="status">{label}</span>
        {progress.phase === "uploading" && <> {percent}%</>}
      </p>
      <Progress
        value={percent}
        aria-label={name}
        aria-valuetext={label}
        className="mt-1 h-1 bg-chip [&>[data-slot=progress-indicator]]:transition-transform [&>[data-slot=progress-indicator]]:duration-(--ht-duration-fast) motion-reduce:[&>[data-slot=progress-indicator]]:transition-none"
      />
    </div>
  );
}
