import type { RoutineUpdate } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import {
  useRoutineWritesForAnyAgent,
  useUpdateActivityForAnyAgent,
} from "../../../hooks/queries";
import { useOrgWriteLock } from "../../../hooks/use-org-write-lock";
import { useRoutineScheduleFloor } from "../../../hooks/use-routine-schedule-floor";
import { analytics } from "../../../lib/analytics";
import { genericErrorDescription } from "../../../lib/error-report";
import { showExpectedStateToast } from "../../../lib/error-toast";
import type { Agent } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";

export interface TeamRoutineActions {
  onToggle: (routineId: string, enabled: boolean) => void;
  onScheduleChange: (routineId: string, cron: string) => void;
  onDeleteRoutine: (routineId: string) => void;
  onRunNow: (routineId: string) => void;
  onStopRun: (routineId: string, runId: string) => void;
  onDiscardDraft: (activityId: string) => void;
}

export function useTeamRoutineActions(agent: Agent): TeamRoutineActions {
  const { t } = useTranslation("routines");
  const { t: planT } = useTranslation("plan");
  const { t: teamsT } = useTranslation("teams");
  const floor = useRoutineScheduleFloor();
  const addToast = useUIStore((s) => s.addToast);
  const { update, remove, runNow, cancelRun } = useRoutineWritesForAnyAgent();
  const updateActivity = useUpdateActivityForAnyAgent();
  const agentPath = agent.folderPath;
  const lock = useOrgWriteLock();
  const unlocked = (): boolean => {
    if (!lock.locked) return true;
    showExpectedStateToast(teamsT("status.lockedCard.title"), lock.reason);
    return false;
  };
  const save = (routineId: string, updates: RoutineUpdate) =>
    unlocked() && update.mutate({ agentPath, routineId, updates });

  return {
    onToggle: (routineId, enabled) => save(routineId, { enabled }),
    onScheduleChange: (routineId, cron) => {
      if (floor && !floor.allows(cron)) {
        addToast({ title: planT("shortInterval", { minutes: floor.minutes }) });
        return;
      }
      save(routineId, { schedule: cron });
    },
    onDeleteRoutine: (routineId) =>
      unlocked() && remove({ agentPath, routineId }),
    onRunNow: (routineId) => {
      if (!unlocked()) return;
      analytics.track("routine_executed", { routine_id: routineId });
      runNow({ agentPath, routineId });
    },
    onStopRun: (routineId, runId) => cancelRun({ agentPath, routineId, runId }),
    onDiscardDraft: (activityId) => {
      if (!unlocked()) return;
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
