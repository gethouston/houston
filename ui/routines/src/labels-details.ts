/**
 * Label contracts + English defaults for the routine details surface
 * (PRODUCT-1208): the "what this routine does" panel and its run-history list.
 * A sibling of `labels.ts` (that file is at its size budget); same rules —
 * `ui/` stays i18n-agnostic, the app passes `t()` results in.
 */

import type { RunStatus } from "./types";

/** The run-history list: one plain-language word per run outcome. */
export interface RoutineRunListLabels {
  /** Empty state when the routine has never fired. */
  empty: string;
  /** Human status labels, keyed by the run's `RunStatus`. Flat strings only
   *  (rendered straight into JSX — see the plural-object crash guard). */
  status: Record<RunStatus, string>;
}

/** The details panel: section headers over the prompt + run history. */
export interface RoutineDetailsLabels {
  /** Header over the routine's instruction text. */
  promptTitle: string;
  /** Header over the run-history list. */
  runsTitle: string;
  /** Quiet line while the run history is being fetched. */
  runsLoading: string;
}

export const DEFAULT_RUN_LIST_LABELS: RoutineRunListLabels = {
  empty: "No runs yet",
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
  runsTitle: "Recent runs",
  runsLoading: "Loading runs…",
};
