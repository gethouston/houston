import { AsyncButton, cn } from "@houston-ai/core";
import type { TFunction } from "i18next";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MigrationTask } from "../../../lib/cloud-migration";
import type { AgentMigrationProgress } from "../../../lib/cloud-migration-progress";
import { MigrationStatusCycle } from "./status-cycle";

/** Steps that render the spinner (the run is actively working this agent). */
export const RUNNING_STEPS: ReadonlySet<AgentMigrationProgress["step"]> =
  new Set(["creating", "warming", "uploading", "finalizing"]);

function stepLabel(
  t: TFunction<"migration">,
  p: AgentMigrationProgress,
): string {
  switch (p.step) {
    case "pending":
      return t("progress.step.pending");
    case "creating":
      return t("progress.step.creating");
    case "warming":
      return t("progress.step.warming");
    case "uploading":
      return t("progress.step.uploading", {
        done: p.filesDone,
        total: Math.max(p.filesTotal, 1),
      });
    case "finalizing":
      return t("progress.step.finalizing");
    case "done":
      // "412 files moved" when we counted any; plain "Done" otherwise
      // (a resumed agent from an earlier run has nothing new to count).
      return p.filesDone > 0
        ? t("progress.filesMoved", { count: p.filesDone })
        : t("progress.step.done");
    case "error":
      return t("progress.step.error");
  }
}

function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * One agent's live row: name, step (with the server-confirmed file counter
 * while uploading), and — so the move never looks stalled — a cycling line of
 * the file names riding the upload request currently in flight.
 */
export function AgentRow({
  task,
  progress,
  onRetry,
}: {
  task: MigrationTask;
  progress: AgentMigrationProgress;
  onRetry: () => Promise<void>;
}) {
  const { t } = useTranslation("migration");
  const running = RUNNING_STEPS.has(progress.step);
  const uploadingFiles =
    progress.step === "uploading" && progress.currentPaths.length > 0;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-chip px-4 py-3">
      <span className="shrink-0">
        {progress.step === "done" ? (
          <Check className="size-4 text-ink" />
        ) : progress.step === "error" ? (
          <CircleAlert className="size-4 text-danger" />
        ) : (
          <Loader2
            className={cn("size-4 text-ink-muted", running && "animate-spin")}
          />
        )}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{task.targetName}</p>
        <p className="truncate text-xs text-ink-muted">
          {progress.step === "error" && progress.errorMessage
            ? progress.errorMessage
            : stepLabel(t, progress)}
        </p>
        {uploadingFiles && (
          <MigrationStatusCycle
            phrases={progress.currentPaths.map(fileName)}
            className="truncate text-[11px] text-ink-muted opacity-70"
          />
        )}
      </div>
      {progress.step === "error" && (
        <AsyncButton
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => onRetry()}
        >
          {t("progress.retry")}
        </AsyncButton>
      )}
    </div>
  );
}
