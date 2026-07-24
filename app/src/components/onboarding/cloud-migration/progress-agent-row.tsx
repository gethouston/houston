import { AsyncButton, cn } from "@houston-ai/core";
import type { TFunction } from "i18next";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MigrationTask } from "../../../lib/cloud-migration";
import type { AgentMigrationProgress } from "../../../lib/cloud-migration-progress";

/**
 * One agent's row in the migration attention panel (HOU-719) — shown only when
 * a run needs the user (a failed agent): status icon, live step label, and the
 * per-row Retry. The happy path renders the aggregate wait screen instead
 * (see `progress-screen.tsx`).
 */

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
        current: Math.max(p.chunkIndex, 1),
        total: Math.max(p.chunkCount, 1),
      });
    case "finalizing":
      return t("progress.step.finalizing");
    case "done":
      return t("progress.step.done");
    case "error":
      return t("progress.step.error");
  }
}

/** The steps that mean "work is actively happening on this agent". */
export const RUNNING: ReadonlySet<AgentMigrationProgress["step"]> = new Set([
  "creating",
  "warming",
  "uploading",
  "finalizing",
]);

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
  const running = RUNNING.has(progress.step);
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
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.targetName}</p>
        <p className="truncate text-xs text-ink-muted">
          {progress.step === "error" && progress.errorMessage
            ? progress.errorMessage
            : stepLabel(t, progress)}
        </p>
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
