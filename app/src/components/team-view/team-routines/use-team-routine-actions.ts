import { freeScheduleAllowed } from "@houston/sdk";
import { useTranslation } from "react-i18next";
import {
  useRoutineWritesForAnyAgent,
  useUpdateActivityForAnyAgent,
} from "../../../hooks/queries";
import { usePlan } from "../../../hooks/queries/use-plan";
import { analytics } from "../../../lib/analytics";
import { genericErrorDescription } from "../../../lib/error-report";
import type { Agent } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";

/** Every row action the grid fires, keyed by routine or draft activity id. */
export interface TeamRoutineActions {
  onToggle: (routineId: string, enabled: boolean) => void;
  onScheduleChange: (routineId: string, cron: string) => void;
  onDeleteRoutine: (routineId: string) => void;
  onRunNow: (routineId: string) => void;
  onStopRun: (routineId: string, runId: string) => void;
  onDiscardDraft: (activityId: string) => void;
}

/**
 * The employee's row actions. Plain `.mutate` throughout: `call()` already
 * reports every failure, and a `.mutateAsync` without a catch would be an
 * unhandled rejection. Discarding a draft is the one exception: the activity
 * update throws its own "Activity not found" without going through `call()`,
 * so that one is awaited and toasted here.
 */
export function useTeamRoutineActions(agent: Agent): TeamRoutineActions {
  const { t } = useTranslation("routines");
  const { t: planT } = useTranslation("plan");
  const { data: plan } = usePlan();
  const addToast = useUIStore((s) => s.addToast);
  const { update, remove, runNow, cancelRun } = useRoutineWritesForAnyAgent();
  const updateActivity = useUpdateActivityForAnyAgent();
  const agentPath = agent.folderPath;

  return {
    onToggle: (routineId, enabled) =>
      update.mutate({ agentPath, routineId, updates: { enabled } }),
    // Inline cron edit from the row: the same update route every other routine
    // write uses (`schedule` clears any trigger binding server-side).
    onScheduleChange: (routineId, cron) => {
      if (!freeScheduleAllowed(cron, plan)) {
        addToast({ title: planT("shortInterval") });
        return;
      }
      update.mutate({ agentPath, routineId, updates: { schedule: cron } });
    },
    onDeleteRoutine: (routineId) => remove.mutate({ agentPath, routineId }),
    // Manual runs are the intentional analytics signal for usage.
    onRunNow: (routineId) => {
      analytics.track("routine_executed", { routine_id: routineId });
      runNow.mutate({ agentPath, routineId });
    },
    onStopRun: (routineId, runId) =>
      cancelRun.mutate({ agentPath, routineId, runId }),
    onDiscardDraft: (activityId) => {
      void updateActivity
        .mutateAsync({ agentPath, activityId, update: { status: "archived" } })
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
