/**
 * RoutinesGrid — the Routines list surface. This file owns the props contract
 * and the top-level gating (loading spinner, empty state) and delegates the
 * populated view to RoutinesGridList, keeping each file under the size cap.
 *
 * The parent tab already labels this surface "Routines", so it skips a
 * redundant page header. Timezone is an account-wide setting (one zone for
 * every routine), so its picker lives on the list, not inside each editor.
 *
 * "New routine → Manually" opens a LOCAL, uncommitted draft editor as the first
 * card in the list (`newDraft`) — nothing is written until Save succeeds.
 */
import type { ReactNode } from "react";
import type {
  NextFireLabels,
  RoutineRowLabels,
  ScheduleLabels,
  ScheduleSummaryLabels,
} from "./labels";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";
import { RoutinesGridEmpty } from "./routines-grid-empty";
import { RoutinesGridList } from "./routines-grid-list";
import type { Routine, RoutineRun } from "./types";

/** Minimal shape for a "routine in construction" chat — ui/ stays app-agnostic. */
export interface RoutineDraft {
  id: string;
}

/** A local, uncommitted new-routine editor rendered as the list's first card.
 *  Nothing is written to disk until `onSave` resolves true. */
export interface RoutinesGridNewDraft {
  onSave: (patch: {
    name: string;
    schedule: string;
    prompt: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}

export interface RoutinesGridProps {
  routines: Routine[];
  /** Most recent run per routine, keyed by routine ID. */
  lastRuns?: Record<string, RoutineRun>;
  /** Chats still building a routine that hasn't been created yet — a person
   *  can have several going at once. Each shows as its own resumable row. */
  draftActivities?: RoutineDraft[];
  /** When set, a local new-routine editor renders as the list's first card. */
  newDraft?: RoutinesGridNewDraft | null;
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string;
  /**
   * Persist a new account-wide timezone. Changing it re-times every routine.
   * Omit it (standalone callers) and the timezone bar is hidden.
   */
  onTimezoneChange?: (tz: string) => void;
  loading?: boolean;
  onCreateWithAi?: () => void;
  onCreateManually?: () => void;
  onToggle?: (routineId: string, enabled: boolean) => void;
  /** Save a row's inline-edited name/schedule/instruction. Resolves true on
   *  success (the panel closes) or false (it stays open). */
  onSaveRoutine?: (
    routineId: string,
    patch: { name: string; schedule: string; prompt: string },
  ) => Promise<boolean>;
  /** Open a routine's chat to change it by asking instead. */
  onEditWithAi?: (routineId: string) => void;
  onDeleteRoutine?: (routineId: string) => void;
  /** Fire a routine immediately. */
  onRunNow?: (routineId: string) => void;
  /** Stop a routine's in-flight run (its most recent run's id). */
  onStopRun?: (routineId: string, runId: string) => void;
  onResumeDraft?: (activityId: string) => void;
  onDiscardDraft?: (activityId: string) => void;
  /** Icon for "With AI" / "Edit with AI" menu entries — app supplies the
   *  brand mark (`ui/` stays brand-agnostic per the library boundary). */
  aiIcon?: ReactNode;
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
  /** Full schedule-builder labels, for each row's inline edit panel. */
  scheduleLabels?: ScheduleLabels;
  /** BCP-47 locale for day names + time formatting in row summaries. */
  locale?: string;
}

export function RoutinesGrid(props: RoutinesGridProps) {
  const {
    routines,
    draftActivities = [],
    newDraft,
    loading,
    labels = DEFAULT_GRID_LABELS,
    aiIcon,
    onCreateWithAi,
    onCreateManually,
  } = props;

  // Sort: enabled first, then alphabetical.
  const sorted = [...routines].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (loading && routines.length === 0 && draftActivities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <p className="text-sm text-muted-foreground animate-pulse">
          {labels.loading}
        </p>
      </div>
    );
  }

  // Empty state only when there's genuinely nothing to show. An open new-routine
  // editor (newDraft) keeps the populated view so the editor card can render.
  if (sorted.length === 0 && draftActivities.length === 0 && !newDraft) {
    return (
      <RoutinesGridEmpty
        labels={labels}
        aiIcon={aiIcon}
        onCreateWithAi={onCreateWithAi}
        onCreateManually={onCreateManually}
      />
    );
  }

  return <RoutinesGridList {...props} sorted={sorted} />;
}
