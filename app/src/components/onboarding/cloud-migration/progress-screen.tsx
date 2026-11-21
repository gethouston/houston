import { AsyncButton, Button, Spinner } from "@houston-ai/core";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { computeOverallProgress } from "../../../lib/cloud-migration-progress";
import { useCloudMigrationStore } from "../../../stores/cloud-migration";
import { MigrationProgressBar } from "./migration-progress-bar";
import { MigrationUploadProgress } from "./migration-upload-progress";
import { AgentRow, RUNNING } from "./progress-agent-row";
import { SpaceInvaders } from "./space-invaders";
import { MigrationStatusCycle } from "./status-cycle";
import { WizardFrame } from "./wizard-frame";

function DeferButton({ onDefer }: { onDefer: () => void }) {
  const { t } = useTranslation("migration");
  return (
    <button
      type="button"
      onClick={onDefer}
      className="rounded-full px-3 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
    >
      {t("progress.migrateLater")}
    </button>
  );
}

export function ProgressScreen({ onDefer }: { onDefer?: () => void }) {
  const { t } = useTranslation("migration");
  const reduce = useReducedMotion() ?? false;
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
  const indeterminate = backingUp || preparing;
  const statusPhrases = backingUp
    ? [t("progress.backingUp")]
    : preparing
      ? [t("progress.preparing")]
      : phrases;

  return (
    <WizardFrame
      mark={waiting ? <Spinner className="size-8" /> : undefined}
      title={t("progress.title")}
      footer={
        startError ? (
          onDefer && <DeferButton onDefer={onDefer} />
        ) : anyError && !anyRunning ? (
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={continueAnyway}
            >
              {t("progress.continueAnyway")}
            </Button>
            {onDefer && <DeferButton onDefer={onDefer} />}
          </div>
        ) : onDefer ? (
          <DeferButton onDefer={onDefer} />
        ) : undefined
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {startError ? (
          <div className="flex w-full max-w-md flex-col items-center gap-3 self-center rounded-2xl border border-line bg-card p-6 text-ink shadow-raised">
            <p className="text-sm">{t("progress.startFailed")}</p>
            <p className="text-xs text-ink-muted">{startError}</p>
            <AsyncButton className="rounded-full" onClick={() => start()}>
              {t("progress.retry")}
            </AsyncButton>
          </div>
        ) : anyError ? (
          <div className="flex w-full flex-col gap-3 rounded-2xl border border-line bg-card p-6 text-ink shadow-raised">
            <p className="text-center text-xs text-ink-muted">
              {t("progress.overall", {
                done: done.length,
                total: tasks.length,
              })}
            </p>
            <div className="flex max-h-[44dvh] flex-col gap-2 overflow-y-auto">
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
          <div className="flex w-full flex-col items-center gap-5">
            <div className="flex w-full max-w-xs flex-col items-center gap-3">
              <MigrationStatusCycle phrases={statusPhrases} />
              <MigrationProgressBar
                fraction={
                  indeterminate ? null : computeOverallProgress(tasks, progress)
                }
              />
              {!indeterminate && (
                <div className="flex flex-col gap-1">
                  {tasks
                    .filter(
                      (task) => progress[task.sourceId]?.step === "uploading",
                    )
                    .map((task) => (
                      <MigrationUploadProgress
                        key={task.sourceId}
                        name={task.targetName}
                        progress={progress[task.sourceId].uploadProgress}
                      />
                    ))}
                  {tasks.length > 1 && (
                    <p className="text-xs text-ink-muted">
                      {t("progress.overall", {
                        done: done.length,
                        total: tasks.length,
                      })}
                    </p>
                  )}
                  <p className="text-xs text-ink-muted">
                    {t("progress.keepOpen")}
                  </p>
                </div>
              )}
            </div>
            {!indeterminate && !reduce && (
              <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-2 rounded-2xl border border-line bg-card/60 p-4">
                <p className="text-xs text-ink-muted">
                  {t("progress.playCaption")}
                </p>
                <SpaceInvaders />
                <p className="text-center text-[11px] text-ink-muted">
                  {t("progress.playHint")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </WizardFrame>
  );
}
