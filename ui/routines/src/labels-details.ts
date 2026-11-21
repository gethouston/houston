import type { RunStatus } from "./types";

export interface RoutineRunListLabels {
  empty: string;
  openRun: string;
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
