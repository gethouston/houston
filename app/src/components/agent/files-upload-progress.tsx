import { AttachmentProgress } from "@houston-ai/chat";
import { FileTypeGlyphInline } from "@houston-ai/core";
import { formatBytes } from "../../lib/attachment-validation";
import type { UploadDisplayProgress } from "../../lib/upload-progress";
import { useUploadProgressLabels } from "../upload-progress-provider";

export function FilesUploadProgress({
  progress,
}: {
  progress: UploadDisplayProgress;
}) {
  const labels = useUploadProgressLabels();
  if (progress.size === 0) return null;
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {Array.from(progress, ([file, report]) => {
        const name = file.webkitRelativePath || file.name;
        return (
          <div
            key={`${name}:${file.size}:${file.lastModified}`}
            className="flex min-w-0 items-start gap-3"
          >
            <FileTypeGlyphInline
              extension={file.name.split(".").pop() ?? ""}
              className="size-5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{name}</p>
              <AttachmentProgress
                name={name}
                progress={report}
                labels={labels}
              />
            </div>
            <span className="shrink-0 text-xs text-ink-muted tabular-nums">
              {formatBytes(file.size)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
