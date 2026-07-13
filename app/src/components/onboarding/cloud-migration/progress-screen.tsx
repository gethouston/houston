import { AsyncButton, Button, cn } from "@houston-ai/core";
import type { TFunction } from "i18next";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MigrationTask } from "../../../lib/cloud-migration";
import type { AgentMigrationProgress } from "../../../lib/cloud-migration-progress";
import { useCloudMigrationStore } from "../../../stores/cloud-migration";
import { OrbitLoader } from "../../space/orbit-loader";
import { MigrationStatusCycle } from "./status-cycle";
import { WizardFrame } from "./wizard-frame";

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

const RUNNING: ReadonlySet<AgentMigrationProgress["step"]> = new Set([
  "creating",
  "warming",
  "uploading",
  "finalizing",
]);

function AgentRow({
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

/**
 * Live migration wait screen (HOU-719 redesign): the shared {@link OrbitLoader}
 * (the rocket in transit — the move made literal) over a status line that
 * cycles through the real phases, directly on the space backdrop, so the wait
 * feels alive without exposing per-agent plumbing. Falls back to a per-agent
 * list panel only when something needs the user's attention (a failed agent).
 */
export function ProgressScreen({ onDefer }: { onDefer?: () => void }) {
  const { t } = useTranslation("migration");
  const {
    preparing,
    backingUp,
    startError,
    tasks,
    progress,
    start,
    retryTask,
  } = useCloudMigrationStore();
  const continueAnyway = useCloudMigrationStore((s) => s.continueAnyway);

  const done = tasks.filter((x) => progress[x.sourceId]?.step === "done");
  const anyRunning = tasks.some((x) =>
    RUNNING.has(progress[x.sourceId]?.step ?? "pending"),
  );
  const anyError = tasks.some((x) => progress[x.sourceId]?.step === "error");

  const phrases = [
    t("progress.phaseAssistants"),
    t("progress.phaseConversations"),
    t("progress.phaseFiles"),
    t("progress.phaseCloud"),
  ];

  const waiting = !startError && !anyError;

  return (
    <WizardFrame
      mark={waiting ? <OrbitLoader /> : undefined}
      title={t("progress.title")}
      footer={
        startError ? undefined : anyError && !anyRunning ? (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={continueAnyway}
          >
            {t("progress.continueAnyway")}
          </Button>
        ) : onDefer ? (
          // The migration is still running (backup / prepare / uploading): let
          // the user leave and finish later from Settings if it's slow.
          <button
            type="button"
            onClick={onDefer}
            className="rounded-full px-3 py-1 text-xs text-[var(--ht-space-foreground-muted)] transition-colors hover:text-[var(--ht-space-foreground)]"
          >
            {t("progress.migrateLater")}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {startError ? (
          <div className="flex w-full max-w-md flex-col items-center gap-3 self-center rounded-2xl border border-[var(--ht-space-glass-border)] bg-[var(--ht-space-glass)] p-6 text-ink shadow-2xl backdrop-blur-md">
            <p className="text-sm">{t("progress.startFailed")}</p>
            <p className="text-xs text-ink-muted">{startError}</p>
            <AsyncButton className="rounded-full" onClick={() => start()}>
              {t("progress.retry")}
            </AsyncButton>
          </div>
        ) : backingUp ? (
          <MigrationStatusCycle phrases={[t("progress.backingUp")]} />
        ) : preparing ? (
          <MigrationStatusCycle phrases={[t("progress.preparing")]} />
        ) : anyError ? (
          <div className="flex w-full flex-col gap-3 rounded-2xl border border-[var(--ht-space-glass-border)] bg-[var(--ht-space-glass)] p-6 text-ink shadow-2xl backdrop-blur-md">
            <p className="text-center text-xs text-ink-muted">
              {t("progress.overall", {
                done: done.length,
                total: tasks.length,
              })}
            </p>
            <div className="flex max-h-[44vh] flex-col gap-2 overflow-y-auto">
              {tasks.map((task) => (
                <AgentRow
                  key={task.sourceId}
                  task={task}
                  progress={progress[task.sourceId]}
                  onRetry={() => retryTask(task.sourceId)}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <MigrationStatusCycle phrases={phrases} />
            <p className="text-xs text-[var(--ht-space-foreground-muted)] opacity-80">
              {t("progress.keepOpen")}
            </p>
          </>
        )}
      </div>
    </WizardFrame>
  );
}
