/**
 * Label contracts + English defaults for the routine detail screen
 * (PRODUCT-1208): the per-routine section (what it does, when it runs, its
 * model) and its execution history. A sibling of `labels.ts` (that file is at
 * its size budget); same rules — `ui/` stays i18n-agnostic, the app passes
 * `t()` results in.
 */

import type { RunStatus } from "./types";

/** The execution-history list: one plain-language word per run outcome. */
export interface RoutineRunListLabels {
  /** Empty state when the routine has never fired. */
  empty: string;
  /** Accessible suffix for a clickable run row ("open this run's chat"). */
  openRun: string;
  /** Human status labels, keyed by the run's `RunStatus`. Flat strings only
   *  (rendered straight into JSX — see the plural-object crash guard). */
  status: Record<RunStatus, string>;
}

/** The routine detail screen's section headers. */
export interface RoutineDetailsLabels {
  /** Header over the routine's instruction text. */
  promptTitle: string;
  /** Header over the wake summary (schedule or event). */
  scheduleTitle: string;
  /** Header over the model row. */
  modelTitle: string;
  /** Header over the execution history. */
  runsTitle: string;
  /** Quiet line while the run history is being fetched. */
  runsLoading: string;
}

export const DEFAULT_RUN_LIST_LABELS: RoutineRunListLabels = {
  empty: "No runs yet",
  openRun: "Open this run's chat",
  status: {
    running: "Running",
    silent: "Nothing to report",
    surfaced: "Done",
    error: "Failed",
    cancelled: "Stopped",
  },
};

export const DEFAULT_DETAILS_LABELS: RoutineDetailsLabels = {
  promptTitle: "What this routine does",
  scheduleTitle: "When it runs",
  modelTitle: "Model",
  runsTitle: "Runs",
  runsLoading: "Loading runs…",
};
