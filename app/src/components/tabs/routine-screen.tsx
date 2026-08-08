/**
 * RoutineScreen — a routine's own page (PRODUCT-1208), REPLACING the tab's
 * main content (the list) when a row is clicked; never a side panel, never a
 * popover. The user can read AND edit here: the description (the routine's
 * prompt, in a plain textarea) and the run frequency (the same schedule
 * builder the rows use). "Runs" opens the execution history in a modal;
 * "Open chat" continues to the setup chat in the shell panel.
 */

import { Button, Textarea } from "@houston-ai/core";
import type { Routine } from "@houston-ai/engine-client";
import {
  cronSummary,
  describeNextFire,
  nextFire,
  RoutineRowScheduleEdit,
  type RoutineRun,
} from "@houston-ai/routines";
import { ArrowLeft, History, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateRoutine } from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { genericErrorDescription } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { RoutineActivationChip } from "./routine-activation-chip";
import { RoutineModelSelector } from "./routine-model-selector";
import { RoutineRunsDialog } from "./routine-runs-dialog";

interface Props {
  agent: Agent;
  routine: Routine;
  /** ALL of the agent's runs (the tab's cached query); filtered here. */
  allRuns: RoutineRun[] | undefined;
  runsLoading: boolean;
  /** Humanized event summary for a trigger routine (useRoutineTriggers). */
  triggerSummary?: string;
  /** The account-wide zone cron schedules fire in. */
  accountTimezone: string;
  /** Whether Escape should leave the screen (false while a chat panel is the
   *  active surface — its own Escape handler owns the key then). */
  escapeActive: boolean;
  onBackToList: () => void;
  onOpenChat: () => void;
  onOpenRun: (run: RoutineRun) => void;
}

export function RoutineScreen({
  agent,
  routine,
  allRuns,
  runsLoading,
  triggerSummary,
  accountTimezone,
  escapeActive,
  onBackToList,
  onOpenChat,
  onOpenRun,
}: Props) {
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();
  const addToast = useUIStore((s) => s.addToast);
  const updateRoutine = useUpdateRoutine(agent.folderPath);
  const [runsOpen, setRunsOpen] = useState(false);

  // The editable description IS the routine's prompt. The draft follows
  // outside edits (the agent rewrote it in chat) only while untouched.
  const [draft, setDraft] = useState(routine.prompt);
  const dirty = draft !== routine.prompt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed only on the routine's own change
  useEffect(() => setDraft(routine.prompt), [routine.id, routine.prompt]);

  const save = (updates: { prompt?: string; schedule?: string }) =>
    updateRoutine.mutate(
      { routineId: routine.id, updates },
      {
        onError: (err) =>
          addToast({
            title: t("toasts.updateError"),
            description: genericErrorDescription("update_routine", err),
            variant: "error",
          }),
      },
    );

  // Escape leaves the screen (back to the list) — same key convention as the
  // panes — but only while this screen is the active surface.
  useEffect(() => {
    if (!escapeActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        el.blur();
        return;
      }
      onBackToList();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [escapeActive, onBackToList]);

  const next =
    !routine.trigger && routine.enabled && routine.schedule
      ? nextFire(routine.schedule, accountTimezone)
      : null;
  const nextRunText = next
    ? (() => {
        const d = describeNextFire(
          next,
          accountTimezone,
          new Date(),
          labels.nextFire,
          labels.locale,
        );
        return `${t("details.nextRun", { when: d.relative })} · ${d.absolute}`;
      })()
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-8 pt-6 pb-5">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={onBackToList}
            aria-label={t("chat.back")}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-medium text-ink">
            {routine.name}
          </h2>
          {routine.trigger && (
            <RoutineActivationChip
              agentId={agent.id}
              routineId={routine.id}
              trigger={routine.trigger}
            />
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRunsOpen(true)}
          >
            <History className="size-4" />
            {t("details.runsTitle")}
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenChat}>
            <MessageCircle className="size-4" />
            {t("details.openChat")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink">
              {t("details.promptTitle")}
            </h3>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              className="text-base"
              aria-label={t("details.promptTitle")}
            />
            {dirty && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft(routine.prompt)}
                >
                  {t("row.cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={updateRoutine.isPending || !draft.trim()}
                  onClick={() => save({ prompt: draft })}
                >
                  {t("row.save")}
                </Button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink">
              {t("details.scheduleTitle")}
            </h3>
            {routine.trigger ? (
              <p className="text-sm text-ink">
                {triggerSummary ?? labels.trigger.wakeEvent}
              </p>
            ) : (
              <RoutineRowScheduleEdit
                routineId={routine.id}
                cron={routine.schedule ?? ""}
                summary={cronSummary(
                  routine.schedule ?? "",
                  labels.schedule.summary,
                  labels.locale,
                )}
                onScheduleChange={(routineId, cron) => {
                  void routineId;
                  save({ schedule: cron });
                }}
                labels={labels.rowLabels}
                scheduleLabels={labels.schedule}
                locale={labels.locale}
              />
            )}
            {nextRunText && (
              <p className="text-xs text-ink-muted">{nextRunText}</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink">
              {t("details.modelTitle")}
            </h3>
            <div className="self-start">
              <RoutineModelSelector agent={agent} routine={routine} bordered />
            </div>
          </section>
        </div>
      </div>

      <RoutineRunsDialog
        open={runsOpen}
        onOpenChange={setRunsOpen}
        runs={allRuns?.filter((run) => run.routine_id === routine.id)}
        runsLoading={runsLoading}
        locale={labels.locale}
        onOpenRun={(run) => {
          setRunsOpen(false);
          onOpenRun(run);
        }}
      />
    </div>
  );
}
