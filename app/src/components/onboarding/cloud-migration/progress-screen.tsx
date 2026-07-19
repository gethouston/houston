import { AsyncButton, Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useCloudMigrationStore } from "../../../stores/cloud-migration";
import { OrbitLoader } from "../../space/orbit-loader";
import { AgentRow, RUNNING_STEPS } from "./agent-row";
import { MigrationStatusCycle } from "./status-cycle";
import { WizardFrame } from "./wizard-frame";

/** The quiet "Migrate later" escape hatch — the same `onDefer` everywhere:
 *  while the run is still going AND on every error state, so a user stuck on
 *  a failing backup/prepare/agent is never trapped with only Retry (the
 *  Settings "Continue migration" row keeps the re-run available). */
function DeferButton({ onDefer }: { onDefer: () => void }) {
  const { t } = useTranslation("migration");
  return (
    <button
      type="button"
      onClick={onDefer}
      className="rounded-full px-3 py-1 text-xs text-[var(--ht-space-foreground-muted)] transition-colors hover:text-[var(--ht-space-foreground)]"
    >
      {t("progress.migrateLater")}
    </button>
  );
}

/**
 * Live migration wait screen (HOU-719): the shared {@link OrbitLoader} (the
 * rocket in transit — the move made literal) over the per-agent panel. Every
 * agent's row is live for the whole run — step, the server-confirmed file
 * counter, and the file names in flight — so the user can watch the move
 * happen and see exactly which agents landed and which need a retry.
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
    RUNNING_STEPS.has(progress[x.sourceId]?.step ?? "pending"),
  );
  const anyError = tasks.some((x) => progress[x.sourceId]?.step === "error");

  const waiting = !startError && !anyError;

  return (
    <WizardFrame
      mark={waiting ? <OrbitLoader /> : undefined}
      title={t("progress.title")}
      footer={
        startError ? (
          // Backup/prepare failed: Retry lives in the card; the footer offers
          // the way out so the error never traps the user in the wizard.
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
          // The migration is still running (backup / prepare / uploading): let
          // the user leave and finish later from Settings if it's slow.
          <DeferButton onDefer={onDefer} />
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
        ) : preparing || tasks.length === 0 ? (
          <MigrationStatusCycle phrases={[t("progress.preparing")]} />
        ) : (
          <>
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
            {anyRunning && (
              <p className="text-xs text-[var(--ht-space-foreground-muted)] opacity-80">
                {t("progress.keepOpen")}
              </p>
            )}
          </>
        )}
      </div>
    </WizardFrame>
  );
}
