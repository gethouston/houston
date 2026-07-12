import type { RoutineEditPatch } from "@houston-ai/routines";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useCancelRoutineRun,
  useCreateRoutine,
  useDeleteRoutine,
  useRunRoutineNow,
  useUpdateActivity,
  useUpdateRoutine,
} from "../../hooks/queries";
import { useTimezonePreference } from "../../hooks/use-timezone-preference";
import { genericErrorDescription } from "../../lib/error-toast";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { newRoutineInput, routineUpdateFromPatch } from "./routines-tab-model";

/**
 * The mutation wiring shared by the Routines and Reactions tabs (both are
 * filtered views of the one routines list, so create/save/delete/run/timezone
 * behave identically). Extracted so `routine-list-tab.tsx` stays lean and the
 * two tabs never fork this logic. `closeNewDraft` closes the inline "Manually"
 * editor once a create succeeds.
 */
export function useRoutineTabHandlers(agent: Agent, closeNewDraft: () => void) {
  const { t } = useTranslation("routines");
  const path = agent.folderPath;
  const tz = useTimezonePreference();
  const addToast = useUIStore((s) => s.addToast);

  const createRoutine = useCreateRoutine(path);
  const updateRoutine = useUpdateRoutine(path);
  const deleteRoutine = useDeleteRoutine(path);
  const updateActivity = useUpdateActivity(path);
  const runNow = useRunRoutineNow(path);
  const cancelRun = useCancelRoutineRun(path);

  // Save the LOCAL "Manually" editor. Nothing is written until this resolves.
  const handleNewDraftSave = useCallback(
    async (patch: RoutineEditPatch) => {
      try {
        await createRoutine.mutateAsync(newRoutineInput(patch));
        closeNewDraft();
        return true;
      } catch {
        return false; // tauriRoutines.create routes through call(), already toasted
      }
    },
    [createRoutine, closeNewDraft],
  );

  // update toasts via call(); the catch returns false to keep the editor open.
  const handleSaveRoutine = useCallback(
    async (routineId: string, patch: RoutineEditPatch) => {
      try {
        await updateRoutine.mutateAsync({
          routineId,
          updates: routineUpdateFromPatch(patch),
        });
        return true;
      } catch {
        return false;
      }
    },
    [updateRoutine],
  );

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
    handleNewDraftSave,
    handleSaveRoutine,
    handleDiscardDraft,
    handleTimezoneChange,
  };
}
