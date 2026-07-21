/**
 * RoutineRow — one compact, selectable row in the Scheduled list pane.
 *
 * The list/chat split makes the model visible: each routine IS a chat,
 * and the row is the way into it. The whole row is the click target (a
 * `role="option"` element that opens the task's chat on click/Enter/Space and
 * carries an unmistakable selected state), rhyming with the Activity list rows.
 * Interactive controls (the switch, the kebab, the inline schedule pencil, a
 * trigger's Reconnect) stop click/keydown from bubbling so operating them never
 * opens the chat.
 *
 * One aligned grid per row: the identity icon (clock for a schedule, the app's
 * logo for a trigger via `leadingIcon`, run state as a ring) | a min-w-0 title
 * over ONE muted summary line (the schedule summary — editable inline — or a
 * trigger's status chip + event, never a third line) | a compact trailing slot
 * (the next-run relative time, the enable switch, the kebab).
 */
import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
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
import { describeNextFire, nextFire } from "./next-fire";
import { RoutineRowControls } from "./routine-row-controls";
import { RoutineRowStatus } from "./routine-row-status";
import { RoutineRowSummary } from "./routine-row-summary";
import type { Routine, RoutineRun, TriggerStatusItem } from "./types";
import { useNow } from "./use-now";

export interface RoutineRowProps {
  routine: Routine;
  lastRun?: RoutineRun;
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string;
  /** Marks the row whose chat is open in the right pane (selected state). */
  selected?: boolean;
  /** Open the routine's chat — fired by a row click. */
  onOpenChat?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Delete the routine — the menu confirms first. */
  onDelete?: () => void;
  /** Fire the routine immediately — offered only when no run is in flight. */
  onRunNow?: () => void;
  /** Stop the in-flight run — offered only while one is running. */
  onStopRun?: () => void;
  /** The leading IDENTITY icon slot: the triggering app's logo for a trigger
   *  routine (`ui/` cannot resolve logos); absent or `null` falls back to a
   *  clock for a schedule, a bell for a trigger. */
  leadingIcon?: (routine: Routine) => ReactNode;
  /** Edit a schedule routine's cron inline. Supplied + a schedule present turns
   *  the summary line into an always-visible edit affordance. */
  onScheduleChange?: (routineId: string, cron: string) => void;
  /** Localized row labels. English defaults so standalone callers still work. */
  labels?: RoutineRowLabels;
  /** Schedule-builder labels, threaded to the inline schedule editor. */
  scheduleLabels?: ScheduleLabels;
  /** Schedule-summary + next-run labels, threaded to the cron/time formatters. */
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  nextFireLabels?: NextFireLabels;
  /** Trigger (event-driven) copy for the row summary and status badge. */
  triggerLabels?: TriggerLabels;
  /** Live provisioning status for an event-driven routine (badge + reconnect). */
  triggerStatus?: TriggerStatusItem;
  /** Human summary of a trigger routine's event, shown after the status chip. */
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
  selected = false,
  onOpenChat,
  onToggle,
  onDelete,
  onRunNow,
  onStopRun,
  leadingIcon,
  onScheduleChange,
  labels = DEFAULT_ROW_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  triggerStatus,
  triggerSummary,
  onReconnectTrigger,
  locale = "en-US",
}: RoutineRowProps) {
  const now = useNow(60_000);
  const isRunning = lastRun?.status === "running";
  const isPaused = isRunning && !!lastRun?.paused_until;
  const identityIcon = leadingIcon?.(routine);
  // Offer exactly one run control: Stop while running, else Run now.
  const runNow = isRunning ? undefined : onRunNow;
  const stopRun = isRunning ? onStopRun : undefined;

  // The compact trailing next-run time is the pure relative string; the chat
  // header carries the absolute time and last-run detail.
  const next =
    routine.enabled && routine.schedule
      ? nextFire(routine.schedule, accountTimezone, now)
      : null;
  const nextRelative = next
    ? describeNextFire(next, accountTimezone, now, nextFireLabels, locale)
        .relative
    : null;

  return (
    <div
      data-testid="routine-row"
      role="option"
      aria-selected={selected}
      aria-label={onOpenChat ? labels.openChat : undefined}
      tabIndex={onOpenChat ? 0 : undefined}
      onClick={() => onOpenChat?.()}
      onKeyDown={(e) => {
        // Only the row itself opens the chat on Enter/Space; key events from a
        // focused inner control bubble here but carry a different target.
        if (
          onOpenChat &&
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onOpenChat();
        }
      }}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
        onOpenChat &&
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus",
        selected
          ? "border-transparent bg-hover shadow-sm"
          : "border-line bg-card hover:bg-hover/40",
        !routine.enabled && !selected && "opacity-60",
      )}
    >
      {/* Leading identity icon (clock / app logo), run state as a ring. */}
      <RoutineRowStatus
        routine={routine}
        lastRun={lastRun}
        isPaused={isPaused}
        identityIcon={identityIcon}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-ink">
          {routine.name || labels.untitled}
        </p>
        <RoutineRowSummary
          routine={routine}
          lastRun={lastRun}
          onScheduleChange={onScheduleChange}
          labels={labels}
          scheduleLabels={scheduleLabels}
          scheduleSummaryLabels={scheduleSummaryLabels}
          triggerLabels={triggerLabels}
          triggerStatus={triggerStatus}
          triggerSummary={triggerSummary}
          onReconnectTrigger={onReconnectTrigger}
          locale={locale}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {nextRelative && (
          <span className="hidden whitespace-nowrap text-xs tabular-nums text-ink-muted sm:inline">
            {nextRelative}
          </span>
        )}
        <RoutineRowControls
          name={routine.name || labels.untitled}
          enabled={routine.enabled}
          labels={labels}
          onToggle={onToggle}
          runNow={runNow}
          stopRun={stopRun}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
