import { useTranslation } from "react-i18next";
import {
  useRoutineWritesForAnyAgent,
  useUpdateActivityForAnyAgent,
} from "../../../hooks/queries";
import { analytics } from "../../../lib/analytics";
import { genericErrorDescription } from "../../../lib/error-report";
import { useUIStore } from "../../../stores/ui";
import type { TeamRoutineDraftsList } from "../team-routine-drafts-model";
import type { TeamRoutinesList } from "../team-routines-model";

/** Every row action the aggregated grid fires, already routed to its owner. */
export interface TeamRoutineActions {
  onToggle: (key: string, enabled: boolean) => void;
  onScheduleChange: (key: string, cron: string) => void;
  onDeleteRoutine: (key: string) => void;
  onRunNow: (key: string) => void;
  onStopRun: (key: string, runId: string) => void;
  onDiscardDraft: (key: string) => void;
}

/**
 * The team list's row actions. A row's id is the NAMESPACED key
 * (`agentId::routineId`, or `agentId::activityId` for a draft), because two
 * agents can hold routines with the same id — so every callback decodes the key
 * back to its owner before writing, and the write itself names that owner in
 * its variables (`useRoutineWritesForAnyAgent` /
 * `useUpdateActivityForAnyAgent`). Binding a per-agent hook per row is not an
 * option: hooks may not be called in a loop over a roster that changes.
 *
 * Plain `.mutate` throughout: `call()` already toasts every failure, and a
 * `.mutateAsync` without a catch would be an unhandled rejection. Discarding a
 * draft is the one exception, exactly as on the per-agent tab: the activity
 * update throws its own "Activity not found" without going through `call()`,
 * so that one is awaited and toasted here.
 */
export function useTeamRoutineActions(
  list: TeamRoutinesList,
  drafts: TeamRoutineDraftsList,
): TeamRoutineActions {
  const { t } = useTranslation("routines");
  const addToast = useUIStore((s) => s.addToast);
  const { update, remove, runNow, cancelRun } = useRoutineWritesForAnyAgent();
  const updateActivity = useUpdateActivityForAnyAgent();

  /** The owner path + owner-local routine id behind a row key, or null. */
  function target(
    key: string,
  ): { agentPath: string; routineId: string } | null {
    const owner = list.ownerOf[key];
    const routineId = list.routineIdOf[key];
    if (!owner || !routineId) return null;
    return { agentPath: owner.folderPath, routineId };
  }

  return {
    onToggle: (key, enabled) => {
      const to = target(key);
      if (to) update.mutate({ ...to, updates: { enabled } });
    },
    // Inline cron edit from the row: the same update route the tab uses
    // (`schedule` clears any trigger binding server-side).
    onScheduleChange: (key, cron) => {
      const to = target(key);
      if (to) update.mutate({ ...to, updates: { schedule: cron } });
    },
    onDeleteRoutine: (key) => {
      const to = target(key);
      if (to) remove.mutate(to);
    },
    // Manual runs are the intentional analytics signal for usage, tracked with
    // the routine's OWN id so team runs and per-agent runs are one series.
    onRunNow: (key) => {
      const to = target(key);
      if (!to) return;
      analytics.track("routine_executed", { routine_id: to.routineId });
      runNow.mutate(to);
    },
    onStopRun: (key, runId) => {
      const to = target(key);
      if (to) cancelRun.mutate({ ...to, runId });
    },
    onDiscardDraft: (key) => {
      const owner = drafts.ownerOf[key];
      const activityId = drafts.activityIdOf[key];
      if (!owner || !activityId) return;
      void updateActivity
        .mutateAsync({
          agentPath: owner.folderPath,
          activityId,
          update: { status: "archived" },
        })
        .catch((err: unknown) => {
          addToast({
            title: t("toasts.discardError"),
            description: genericErrorDescription("discard_draft", err),
            variant: "error",
          });
        });
    },
  };
}
