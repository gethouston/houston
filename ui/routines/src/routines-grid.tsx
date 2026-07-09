/**
 * RoutinesGrid — list view of routines, with an empty state and primary CTA.
 *
 * The parent tab already labels this surface "Routines", so this view skips
 * a redundant page header and goes straight to a meta row + the list.
 *
 * Timezone is an account-wide setting (one zone for every routine), so its
 * picker lives HERE on the list — not inside each routine's editor. It sits
 * directly under the "New routine" row, capping the list it governs.
 */
import {
  Button,
  cn,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import {
  DEFAULT_GRID_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  type NextFireLabels,
  type RoutineRowLabels,
  type RoutinesGridLabels,
  type ScheduleSummaryLabels,
} from "./labels";
import { RoutineRow } from "./routine-row";
import { TimezonePicker } from "./timezone-picker";
import type { Routine, RoutineRun } from "./types";

export interface RoutinesGridProps {
  routines: Routine[];
  /** Most recent run per routine, keyed by routine ID. */
  lastRuns?: Record<string, RoutineRun>;
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string;
  /**
   * Persist a new account-wide timezone. Changing it re-times every routine.
   * Omit it (standalone callers) and the timezone bar is hidden.
   */
  onTimezoneChange?: (tz: string) => void;
  loading?: boolean;
  onSelect: (routineId: string) => void;
  onCreate?: () => void;
  onToggle?: (routineId: string, enabled: boolean) => void;
  /** Rename a routine from its row's quick-actions menu (inline edit). */
  onRename?: (routineId: string, name: string) => void;
  /** Delete a routine from its row's quick-actions menu (row confirms first). */
  onDelete?: (routineId: string) => void;
  /**
   * Localized labels. English defaults so existing callers still work.
   * Consumers pass `t()` results for localization — `ui/` stays i18n-agnostic
   * per the library-boundary rule.
   */
  labels?: RoutinesGridLabels;
  /** Row-level labels + schedule/next-run formatter labels, threaded to rows. */
  rowLabels?: RoutineRowLabels;
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  nextFireLabels?: NextFireLabels;
  /** BCP-47 locale for day names + time formatting in row summaries. */
  locale?: string;
}

export function RoutinesGrid({
  routines,
  lastRuns = {},
  accountTimezone,
  onTimezoneChange,
  loading,
  onSelect,
  onCreate,
  onToggle,
  onRename,
  onDelete,
  labels = DEFAULT_GRID_LABELS,
  rowLabels = DEFAULT_ROW_LABELS,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
}: RoutinesGridProps) {
  const l = labels;
  // Sort: enabled first, then alphabetical
  const sorted = [...routines].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (loading && routines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <p className="text-sm text-muted-foreground animate-pulse">
          {l.loading}
        </p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
        <div className="mx-auto max-w-md flex flex-col items-center gap-6 text-center pt-24 px-6">
          <EmptyHeader>
            <EmptyTitle>{l.emptyTitle}</EmptyTitle>
            <EmptyDescription>{l.emptyDescription}</EmptyDescription>
          </EmptyHeader>
          {onCreate && (
            <Button onClick={onCreate}>
              <Plus className="size-4" />
              {l.newRoutine}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
      <div className="max-w-3xl mx-auto px-6 py-7">
        {/* Description + CTA. No page title — tab handles it. */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="text-xs text-muted-foreground max-w-md">
            {l.descriptionShort}
          </p>
          {onCreate && (
            <Button size="sm" onClick={onCreate} className="shrink-0">
              <Plus className="size-3.5" />
              {l.newRoutine}
            </Button>
          )}
        </div>

        {/* Account-wide timezone — governs every routine in the list below. */}
        {onTimezoneChange && (
          <TimezonePicker
            accountTimezone={accountTimezone}
            onTimezoneChange={onTimezoneChange}
            label={l.timezoneLabel}
            hint={l.timezoneHint}
            searchPlaceholder={l.timezoneSearchPlaceholder}
            noResults={l.timezoneNoResults}
            className="mb-3"
          />
        )}

        {/* List card — gray, divides hold rows */}
        <div
          className={cn(
            "rounded-xl bg-secondary overflow-hidden",
            "divide-y divide-border/60",
          )}
        >
          {sorted.map((routine) => (
            <RoutineRow
              key={routine.id}
              routine={routine}
              lastRun={lastRuns[routine.id]}
              accountTimezone={accountTimezone}
              onClick={() => onSelect(routine.id)}
              onToggle={
                onToggle
                  ? (enabled) => onToggle(routine.id, enabled)
                  : undefined
              }
              onRename={
                onRename ? (name) => onRename(routine.id, name) : undefined
              }
              onDelete={onDelete ? () => onDelete(routine.id) : undefined}
              labels={rowLabels}
              scheduleSummaryLabels={scheduleSummaryLabels}
              nextFireLabels={nextFireLabels}
              locale={locale}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
