/**
 * RoutineRow — a single full-width row in the routines list.
 *
 * Visual: hairline-divided rows, generous height, state as a leading icon
 * (clock waiting, pulsing bolt running — see RoutineRowStatus). Switch + a
 * three-dot quick-actions menu (run/stop, edit manually / edit with AI, delete)
 * on the right. Rows are NOT clickable — the menu is the only way in, so a stray
 * click never triggers navigation. "Edit manually" expands the RoutineRowEdit
 * panel right here in the list; "Edit with AI" opens the routine's chat instead.
 * The row decides which run control to offer the menu based on lastRun's status.
 */
import { cn, Switch } from "@houston-ai/core";
import { type ReactNode, useState } from "react";
import {
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_TRIGGER_LABELS,
  type NextFireLabels,
  type RoutineRowLabels,
  type ScheduleLabels,
  type ScheduleSummaryLabels,
  type TriggerLabels,
} from "./labels";
import { RoutineRowEdit } from "./routine-row-edit";
import { RoutineRowMenu } from "./routine-row-menu";
import { RoutineRowMeta } from "./routine-row-meta";
import { RoutineRowStatus } from "./routine-row-status";
import { cronSummary } from "./schedule-summary";
import { TriggerStatusBadge } from "./trigger-status-badge";
import type {
  RenderTriggerEditor,
  Routine,
  RoutineEditPatch,
  RoutineRun,
  TriggerStatusItem,
} from "./types";
import { useNow } from "./use-now";

export interface RoutineRowProps {
  routine: Routine;
  lastRun?: RoutineRun;
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string;
  onToggle?: (enabled: boolean) => void;
  /** Save the inline edit panel (name/instruction + wake mechanism). Resolves
   *  true on success (the panel closes) or false (it stays open for a retry). */
  onSave?: (patch: RoutineEditPatch) => Promise<boolean>;
  /** Open the routine's chat to change it by asking instead. */
  onEditWithAi?: () => void;
  /** Delete the routine — the row confirms first. */
  onDelete?: () => void;
  /** Fire the routine immediately — offered only when no run is in flight. */
  onRunNow?: () => void;
  /** Stop the in-flight run — offered only while one is running. */
  onStopRun?: () => void;
  /** Icon for the menu's "Edit with AI" entry — app supplies the brand mark. */
  aiIcon?: ReactNode;
  /** Localized row labels. English defaults so standalone callers still work. */
  labels?: RoutineRowLabels;
  /** Schedule-summary + next-run labels, threaded to the cron/time formatters. */
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  nextFireLabels?: NextFireLabels;
  /** Full schedule-builder labels, for the inline edit panel's picker. */
  scheduleLabels?: ScheduleLabels;
  /** Trigger (event-driven) copy for the picker and status badge. */
  triggerLabels?: TriggerLabels;
  /** Whether the edit panel offers the event wake — true only where the
   *  deployment supports event triggers. */
  allowEventWake?: boolean;
  /** App-wired trigger editor injected into the inline edit panel's event side. */
  renderTriggerEditor?: RenderTriggerEditor;
  /** Live provisioning status for an event-driven routine (badge + reconnect). */
  triggerStatus?: TriggerStatusItem;
  /** Human summary of a trigger routine's event, shown instead of the cron line. */
  triggerSummary?: string;
  /** Reconnect the disconnected account behind a `paused_disconnected` routine. */
  onReconnectTrigger?: () => void;
  /** BCP-47 locale for day names + time formatting. */
  locale?: string;
}

export function RoutineRow({
  routine,
  lastRun,
  accountTimezone,
  onToggle,
  onSave,
  onEditWithAi,
  onDelete,
  onRunNow,
  onStopRun,
  aiIcon,
  labels = DEFAULT_ROW_LABELS,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  allowEventWake = false,
  renderTriggerEditor,
  triggerStatus,
  triggerSummary,
  onReconnectTrigger,
  locale = "en-US",
}: RoutineRowProps) {
  const now = useNow(60_000);
  const [expanded, setExpanded] = useState(false);
  const isRunning = lastRun?.status === "running";
  const isPaused = isRunning && !!lastRun?.paused_until;

  // Offer exactly one run control: Stop while a run is in flight, otherwise
  // Run now. The grid passes both handlers; the row gates which is live.
  const runNow = !isRunning ? onRunNow : undefined;
  const stopRun = isRunning ? onStopRun : undefined;
  const hasMenu = runNow || stopRun || onSave || onEditWithAi || onDelete;

  return (
    // Catalog-grammar row: transparent at rest, the `hover` fill sweeping the
    // full row; while the inline editor is open the row + panel share one
    // `chip` card so they read as a single surface.
    <div
      data-testid="routine-row"
      className={cn(
        "rounded-xl transition-colors",
        expanded ? "bg-chip" : "hover:bg-hover",
        !routine.enabled && !expanded && "opacity-55 hover:opacity-100",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Leading state icon — clock while waiting, pulsing bolt mid-run,
            amber pause while a run sleeps on a usage-limit window. */}
        <RoutineRowStatus
          routine={routine}
          lastRun={lastRun}
          isPaused={isPaused}
        />

        {/* Title + meta column */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate leading-tight">
            {routine.name || labels.untitled}
          </p>
          <p className="text-xs text-ink-muted truncate mt-0.5">
            {routine.trigger
              ? (triggerSummary ?? triggerLabels.wakeEvent)
              : cronSummary(
                  routine.schedule ?? "",
                  scheduleSummaryLabels,
                  locale,
                )}
          </p>
          {routine.trigger && triggerStatus && (
            <TriggerStatusBadge
              status={triggerStatus}
              onReconnect={onReconnectTrigger}
              labels={triggerLabels}
              className="mt-1"
            />
          )}
        </div>

        {/* Right meta column: next run + last run */}
        <RoutineRowMeta
          routine={routine}
          lastRun={lastRun}
          accountTimezone={accountTimezone}
          now={now}
          isPaused={isPaused}
          labels={labels}
          nextFireLabels={nextFireLabels}
          locale={locale}
        />

        {/* Trailing controls */}
        {(onToggle || hasMenu) && (
          <div className="shrink-0 flex items-center gap-1">
            {onToggle && (
              <Switch
                checked={routine.enabled}
                onCheckedChange={(checked) => onToggle(checked)}
                aria-label={
                  routine.enabled ? labels.pauseRoutine : labels.resumeRoutine
                }
              />
            )}
            {hasMenu && (
              <RoutineRowMenu
                name={routine.name || labels.untitled}
                onRunNow={runNow}
                onStopRun={stopRun}
                onEditManually={onSave ? () => setExpanded(true) : undefined}
                onEditWithAi={onEditWithAi}
                onDelete={onDelete}
                labels={labels}
                aiIcon={aiIcon}
              />
            )}
          </div>
        )}
      </div>

      {/* Inline edit panel — mounted only while open, so cancel + reopen starts
          fresh from the routine's current values. */}
      {expanded && onSave && (
        <RoutineRowEdit
          initial={{
            name: routine.name,
            prompt: routine.prompt,
            schedule: routine.schedule,
            trigger: routine.trigger ?? null,
          }}
          onSave={async (patch) => {
            const ok = (await onSave?.(patch)) ?? false;
            if (ok) setExpanded(false);
            return ok;
          }}
          onCancel={() => setExpanded(false)}
          allowEventWake={allowEventWake}
          renderTriggerEditor={renderTriggerEditor}
          triggerStatus={triggerStatus}
          onReconnectTrigger={onReconnectTrigger}
          labels={labels}
          scheduleLabels={scheduleLabels}
          triggerLabels={triggerLabels}
          locale={locale}
        />
      )}
    </div>
  );
}
