/**
 * RoutinesGrid — the Routines list surface. This file owns the props contract
 * and the top-level gating (loading spinner, empty state) and delegates the
 * populated view to RoutinesGridList, keeping each file under the size cap.
 *
 * The tab is chat-first: routines are created and changed by asking the agent,
 * so the grid itself never edits a routine. This is the LEFT pane of the
 * Scheduled split — a persistent, selectable list beside the selected task's
 * chat. A row click opens (selects) that routine's chat; the grid otherwise
 * only enables/disables, runs/stops, and deletes routines, plus lists
 * in-construction draft chats. The pane header (title + create) and the
 * timezone footer are app-owned chrome around this list.
 */
import type { ReactNode } from "react";
import type {
  NextFireLabels,
  RoutineRowLabels,
  ScheduleLabels,
  ScheduleSummaryLabels,
  TriggerLabels,
} from "./labels";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";
import { RoutinesGridEmpty } from "./routines-grid-empty";
import { RoutinesGridList } from "./routines-grid-list";
import type { Routine, RoutineRun, TriggerStatusItem } from "./types";

/** Minimal shape for a "routine in construction" chat — ui/ stays app-agnostic. */
export interface RoutineDraft {
  id: string;
}

export interface RoutinesGridProps {
  routines: Routine[];
  /** Most recent run per routine, keyed by routine ID. */
  lastRuns?: Record<string, RoutineRun>;
  /** Chats still building a routine that hasn't been created yet — a person
   *  can have several going at once. Each shows as its own resumable row. */
  draftActivities?: RoutineDraft[];
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string;
  /** The routine whose chat is open in the right pane — its row is selected. */
  selectedRoutineId?: string | null;
  /** The draft whose chat is open in the right pane — its row is selected. */
  selectedDraftId?: string | null;
  loading?: boolean;
  /** Open a routine's chat — fired by a row click and its "Open chat"
   *  affordance. Changing a routine happens by asking the agent there. */
  onOpenChat?: (routineId: string) => void;
  onToggle?: (routineId: string, enabled: boolean) => void;
  onDeleteRoutine?: (routineId: string) => void;
  /** Fire a routine immediately. */
  onRunNow?: (routineId: string) => void;
  /** Stop a routine's in-flight run (its most recent run's id). */
  onStopRun?: (routineId: string, runId: string) => void;
  onResumeDraft?: (activityId: string) => void;
  onDiscardDraft?: (activityId: string) => void;
  /** The per-row leading IDENTITY icon slot: the app returns the triggering
   *  app's logo for a trigger routine (`ui/` cannot resolve logos); absent or
   *  `null` falls back to a clock for a schedule, a bell for a trigger. */
  leadingIcon?: (routine: Routine) => ReactNode;
  /** Edit a schedule routine's cron inline. When supplied, a schedule routine's
   *  summary line becomes an always-visible edit affordance (popover builder). */
  onScheduleChange?: (routineId: string, cron: string) => void;
  /**
   * Localized labels. English defaults so existing callers still work.
   * Consumers pass `t()` results for localization — `ui/` stays i18n-agnostic
   * per the library-boundary rule.
   */
  labels?: RoutinesGridLabels;
  /** Row-level labels + schedule/next-run formatter labels, threaded to rows. */
  rowLabels?: RoutineRowLabels;
  /** Schedule-builder labels, threaded to the inline schedule editor in a row. */
  scheduleLabels?: ScheduleLabels;
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  nextFireLabels?: NextFireLabels;
  /** Trigger (event-driven) copy for the row summary and status badge. */
  triggerLabels?: TriggerLabels;
  /** Live provisioning status per event-driven routine, keyed by routine id. */
  triggerStatuses?: Record<string, TriggerStatusItem>;
  /** Human event summary per trigger routine (shown instead of the cron line). */
  triggerSummaries?: Record<string, string>;
  /** Reconnect the disconnected account behind a routine's paused trigger. */
  onReconnectTrigger?: (routineId: string) => void;
  /** BCP-47 locale for day names + time formatting in row summaries. */
  locale?: string;
  /** Primary create action shown inside the empty state (the app moves its
   *  "New routine" button here when the list is empty). */
  emptyAction?: ReactNode;
}

export function RoutinesGrid(props: RoutinesGridProps) {
  const {
    routines,
    draftActivities = [],
    loading,
    labels = DEFAULT_GRID_LABELS,
  } = props;

  // Sort: enabled first, then alphabetical.
  const sorted = [...routines].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (loading && routines.length === 0 && draftActivities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <p className="text-sm text-ink-muted animate-pulse">{labels.loading}</p>
      </div>
    );
  }

  // Empty state only when there's genuinely nothing to show.
  if (sorted.length === 0 && draftActivities.length === 0) {
    return <RoutinesGridEmpty labels={labels} action={props.emptyAction} />;
  }

  return <RoutinesGridList {...props} sorted={sorted} />;
}
