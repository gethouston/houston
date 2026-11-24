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
