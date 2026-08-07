/**
 * RoutineDetailPane — a routine's own screen (PRODUCT-1208), rendered into the
 * big shell-level panel (the SAME one the chats use). The row click lands
 * here: the routine's name, what it does, when it runs, the model it runs on,
 * and its execution history. "Open chat" continues to the setup chat (editing
 * stays chat-first); clicking an execution opens that run's chat (its result).
 */

import { Button } from "@houston-ai/core";
import type { Routine } from "@houston-ai/engine-client";
import {
  cronSummary,
  describeNextFire,
  nextFire,
  RoutineDetails,
  type RoutineRun,
  type RunStatus,
} from "@houston-ai/routines";
import { MessageCircle, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import type { Agent } from "../../lib/types";
import { RoutineActivationChip } from "./routine-activation-chip";
import { RoutineModelSelector } from "./routine-model-selector";

interface Props {
  agent: Agent;
  routine: Routine;
  /** ALL of the agent's runs (the tab's cached query); filtered here. */
  allRuns: RoutineRun[] | undefined;
  runsLoading: boolean;
  /** Humanized event summary for a trigger routine (from useRoutineTriggers). */
  triggerSummary?: string;
  /** The account-wide zone cron schedules fire in. */
  accountTimezone: string;
  /** The shell-level panel node this screen portals into. */
  panelContainer: HTMLElement | null;
  onOpenChat: () => void;
  onOpenRun: (run: RoutineRun) => void;
  onClose: () => void;
}

export function RoutineDetailPane({
  agent,
  routine,
  allRuns,
  runsLoading,
  triggerSummary,
  accountTimezone,
  panelContainer,
  onOpenChat,
  onOpenRun,
  onClose,
}: Props) {
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();

  // Escape closes the screen (same convention as the chat pane): a focused
  // editable gets the first Escape to blur, the pane only the next one.
  useEffect(() => {
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
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // The wake summary: a trigger routine's plain-language event, or the
  // humanized cron plus its next fire time.
  const scheduleSummary = routine.trigger
    ? (triggerSummary ?? labels.trigger.wakeEvent)
    : cronSummary(
        routine.schedule ?? "",
        labels.schedule.summary,
        labels.locale,
      );
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
    : undefined;

  const runs = allRuns?.filter((run) => run.routine_id === routine.id);

  const surface = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 bg-background px-4 py-3 dark:bg-transparent">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-medium text-ink">
            {routine.name}
          </h2>
          {routine.trigger && (
            <RoutineActivationChip
              agentId={agent.id}
              routineId={routine.id}
              trigger={routine.trigger}
            />
          )}
          <Button variant="secondary" size="sm" onClick={onOpenChat}>
            <MessageCircle className="size-4" />
            {t("row.openChat")}
          </Button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("chat.close")}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-3xl">
          <RoutineDetails
            prompt={routine.prompt}
            scheduleSummary={scheduleSummary}
            nextRunText={nextRunText}
            modelSlot={<RoutineModelSelector agent={agent} routine={routine} />}
            runs={runs}
            runsLoading={runsLoading}
            onOpenRun={onOpenRun}
            locale={labels.locale}
            labels={{
              promptTitle: t("details.promptTitle"),
              scheduleTitle: t("details.scheduleTitle"),
              modelTitle: t("details.modelTitle"),
              runsTitle: t("details.runsTitle"),
              runsLoading: t("details.runsLoading"),
            }}
            runListLabels={{
              empty: t("details.runsEmpty"),
              openRun: t("details.openRun"),
              status: t("details.status", { returnObjects: true }) as Record<
                RunStatus,
                string
              >,
            }}
          />
        </div>
      </div>
    </div>
  );

  return panelContainer ? createPortal(surface, panelContainer) : null;
}
