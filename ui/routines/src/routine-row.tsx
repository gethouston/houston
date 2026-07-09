/**
 * RoutineRow — a single full-width row in the routines list.
 *
 * Visual: hairline-divided rows, generous height, state as a leading icon
 * (clock waiting, pulsing bolt running — see RoutineRowStatus). Switch + a
 * three-dot quick-actions menu (rename / delete) on the right. The whole row is
 * clickable; the trailing controls stop propagation so using them doesn't open
 * the editor.
 */
import { cn, Switch } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  type NextFireLabels,
  type RoutineRowLabels,
  type ScheduleSummaryLabels,
} from "./labels";
import { RoutineRowMenu } from "./routine-row-menu";
import { RoutineRowMeta } from "./routine-row-meta";
import { RoutineRowStatus } from "./routine-row-status";
import { cronSummary } from "./schedule-summary";
import type { Routine, RoutineRun } from "./types";
import { useNow } from "./use-now";

export interface RoutineRowProps {
  routine: Routine;
  lastRun?: RoutineRun;
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Rename the routine (three-dot menu → inline title edit). */
  onRename?: (name: string) => void;
  /** Delete the routine — the row confirms first. */
  onDelete?: () => void;
  /** Localized row labels. English defaults so standalone callers still work. */
  labels?: RoutineRowLabels;
  /** Schedule-summary + next-run labels, threaded to the cron/time formatters. */
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  nextFireLabels?: NextFireLabels;
  /** BCP-47 locale for day names + time formatting. */
  locale?: string;
}

export function RoutineRow({
  routine,
  lastRun,
  accountTimezone,
  onClick,
  onToggle,
  onRename,
  onDelete,
  labels = DEFAULT_ROW_LABELS,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
}: RoutineRowProps) {
  const now = useNow(60_000);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(routine.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Focus AND select: the boxed, highlighted current name reads as "type
    // to replace" the instant the rename opens.
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== routine.name) onRename?.(trimmed);
    setEditing(false);
  };
  const isPaused = lastRun?.status === "running" && !!lastRun.paused_until;

  // The row hosts a nested interactive control (the Switch, which Radix renders
  // as a native <button role="switch">). Nesting a <button> inside a <button>
  // is invalid HTML, so the outer row stays a <div role="button"> with explicit
  // keyboard activation rather than a native <button>.
  return (
    // biome-ignore lint/a11y/useSemanticElements: a native <button> can't wrap the nested Radix Switch button
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 cursor-pointer",
        "transition-colors duration-150",
        "hover:bg-foreground/[0.03]",
        "focus-visible:outline-none focus-visible:bg-foreground/[0.03]",
        !routine.enabled && "opacity-55",
      )}
    >
      {/* Leading state icon — clock while waiting, pulsing bolt mid-run,
          amber pause while a run sleeps on a usage-limit window. */}
      <RoutineRowStatus
        routine={routine}
        lastRun={lastRun}
        isPaused={isPaused}
      />

      {/* Title + meta column */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={labels.rename}
            className={cn(
              // A full input box (white well + ring), not a bare underline —
              // the rename must read as editable the moment it opens. Negative
              // margins absorb the padding so the row's height doesn't jump.
              "w-full max-w-sm px-2 py-1 -mx-2 -my-1 text-sm font-medium leading-tight",
              "text-foreground bg-background rounded-md",
              "border border-ring/50 ring-2 ring-ring/20 outline-none",
            )}
          />
        ) : (
          <p className="text-sm font-medium text-foreground truncate leading-tight">
            {routine.name || labels.untitled}
          </p>
        )}
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {cronSummary(routine.schedule, scheduleSummaryLabels, locale)}
        </p>
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

      {/* Trailing controls — stop clicks and keys from bubbling to the outer
          row so toggling or opening the menu never opens the editor. */}
      {(onToggle || onRename || onDelete) && (
        <div
          role="none"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center gap-1"
        >
          {onToggle && (
            <Switch
              checked={routine.enabled}
              onCheckedChange={(checked) => onToggle(checked)}
              aria-label={
                routine.enabled ? labels.pauseRoutine : labels.resumeRoutine
              }
            />
          )}
          {(onRename || onDelete) && (
            <RoutineRowMenu
              name={routine.name || labels.untitled}
              onRename={
                onRename
                  ? () => {
                      setEditValue(routine.name);
                      setEditing(true);
                    }
                  : undefined
              }
              onDelete={onDelete}
              labels={labels}
            />
          )}
        </div>
      )}
    </div>
  );
}
