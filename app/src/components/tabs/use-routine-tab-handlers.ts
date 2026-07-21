import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useCancelRoutineRun,
  useDeleteRoutine,
  useRunRoutineNow,
  useUpdateActivity,
  useUpdateRoutine,
} from "../../hooks/queries";
import { useTimezonePreference } from "../../hooks/use-timezone-preference";
import { genericErrorDescription } from "../../lib/error-toast";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

/**
 * The Automations tab's mutation wiring (toggle/delete/run/discard/timezone).
 * Extracted so `routines-tab.tsx` stays lean. Routine creation and editing are
 * chat-first now (the stepper + setup chat), so there is no manual-editor save.
 */
export function useRoutineTabHandlers(agent: Agent) {
  const { t } = useTranslation("routines");
  const path = agent.folderPath;
  const tz = useTimezonePreference();
  const addToast = useUIStore((s) => s.addToast);

  const updateRoutine = useUpdateRoutine(path);
  const deleteRoutine = useDeleteRoutine(path);
  const updateActivity = useUpdateActivity(path);
  const runNow = useRunRoutineNow(path);
  const cancelRun = useCancelRoutineRun(path);

  const handleDiscardDraft = useCallback(
    async (activityId: string) => {
      try {
        // mutateAsync: activityData.update throws "Activity not found" (no
        // call() toast) when the row is already gone, so surface it here.
        await updateActivity.mutateAsync({
          activityId,
          update: { status: "archived" },
        });
      } catch (err) {
        addToast({
          title: t("toasts.discardError"),
          description: genericErrorDescription("discard_draft", err),
          variant: "error",
        });
      }
    },
    [updateActivity, addToast, t],
  );

  const handleTimezoneChange = useCallback(
    async (zone: string) => {
      try {
        await tz.confirm(zone);
        addToast({ title: t("toasts.timezoneSet", { zone }) });
      } catch (err) {
        addToast({
          title: t("toasts.timezoneError"),
          description: genericErrorDescription("set_timezone", err),
          variant: "error",
        });
      }
    },
    [tz, addToast, t],
  );

  return {
    tz,
    updateRoutine,
    deleteRoutine,
    runNow,
    cancelRun,
    handleDiscardDraft,
    handleTimezoneChange,
  };
}
