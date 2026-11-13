import { FileTypeGlyphInline, Progress } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { UploadDisplayProgress } from "../../lib/upload-progress";

export function FilesUploadProgress({
  progress,
}: {
  progress: UploadDisplayProgress;
}) {
  const { t } = useTranslation("chat");
  if (progress.size === 0) return null;
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {Array.from(progress, ([file, report]) => {
        const label = t(`composer.uploadProgress.${report.state}`);
        const percent = Math.round(report.fraction * 100);
        return (
          <div
            key={`${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`}
            className="flex min-w-0 items-center gap-3"
          >
            <FileTypeGlyphInline
              extension={file.name.split(".").pop() ?? ""}
              className="size-5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {file.webkitRelativePath || file.name}
              </p>
              <p className="text-xs text-ink-muted tabular-nums">
                <span role="status">{label}</span>
                {report.state === "uploading" && <> {percent}%</>}
              </p>
              <Progress
                value={percent}
                aria-label={file.name}
                aria-valuetext={label}
                className="mt-1 h-1 bg-chip [&>[data-slot=progress-indicator]]:transition-transform [&>[data-slot=progress-indicator]]:duration-(--ht-duration-fast) motion-reduce:[&>[data-slot=progress-indicator]]:transition-none"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
