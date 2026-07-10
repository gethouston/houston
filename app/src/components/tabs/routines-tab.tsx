import { RoutinesGrid } from "@houston-ai/routines";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useCancelRoutineRun,
  useCreateRoutine,
  useDeleteRoutine,
  useRoutineRuns,
  useRoutines,
  useRunRoutineNow,
  useUpdateActivity,
  useUpdateRoutine,
} from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { useTimezonePreference } from "../../hooks/use-timezone-preference";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-toast";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { HoustonLogo } from "../shell/agent-avatar";
import { RoutineSetupChat } from "./routine-setup-chat";
import {
  latestRunByRoutine,
  type NewRoutinePatch,
  newRoutineInput,
} from "./routines-tab-model";
import { useRoutineChatSetup } from "./use-routine-chat-setup";
import { useRoutinesTabView } from "./use-routines-tab-view";

export default function RoutinesTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();
  const path = agent.folderPath;
  const tz = useTimezonePreference();
  const addToast = useUIStore((s) => s.addToast);

  const { data: routines, isLoading } = useRoutines(path);
  const { data: allRuns } = useRoutineRuns(path);
  const createRoutine = useCreateRoutine(path);
  const updateRoutine = useUpdateRoutine(path);
  const deleteRoutine = useDeleteRoutine(path);
  const updateActivity = useUpdateActivity(path);
  const runNow = useRunRoutineNow(path);
  const cancelRun = useCancelRoutineRun(path);

  const chatSetup = useRoutineChatSetup(agent, routines);
  const nav = useRoutinesTabView(agent, routines, chatSetup);

  const lastRuns = latestRunByRoutine(allRuns);

  // Save the LOCAL "Manually" editor. Nothing is written until this resolves.
  const handleNewDraftSave = useCallback(
    async (patch: NewRoutinePatch) => {
      try {
        await createRoutine.mutateAsync(newRoutineInput(patch));
        nav.closeNewDraft();
        return true;
      } catch {
        return false; // tauriRoutines.create routes through call(), already toasted
      }
    },
    [createRoutine, nav.closeNewDraft],
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

  // update toasts via call(); the catch returns false to keep the editor open.
  const handleSaveRoutine = useCallback(
    async (routineId: string, patch: NewRoutinePatch) => {
      try {
        await updateRoutine.mutateAsync({ routineId, updates: patch });
        return true;
      } catch {
        return false;
      }
    },
    [updateRoutine],
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

  // tz.timezone is auto-seeded non-null from the first render; still wait for
  // the roundtrip so the cron schedule renders against the real zone.
  if (!tz.loaded || !tz.timezone) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">
          {t("loading")}
        </p>
      </div>
    );
  }

  const { view } = nav;
  if (view.type === "chat" || view.type === "chat-draft") {
    const routine =
      view.type === "chat"
        ? routines?.find((r) => r.id === view.routineId)
        : undefined;
    const activity =
      view.type === "chat"
        ? routine
          ? chatSetup.activityFor(routine)
          : null
        : view.activityId
          ? (chatSetup.draftActivities.find((a) => a.id === view.activityId) ??
            null)
          : null;
    return (
      <RoutineSetupChat
        agent={agent}
        agentDef={agentDef}
        activity={activity}
        kind={view.type === "chat" ? "routine" : "draft"}
        routineName={routine?.name}
        onBack={nav.backToGrid}
      />
    );
  }

  return (
    <RoutinesGrid
      routines={routines ?? []}
      lastRuns={lastRuns}
      draftActivities={chatSetup.draftActivities}
      newDraft={
        nav.newDraftOpen
          ? { onSave: handleNewDraftSave, onCancel: nav.closeNewDraft }
          : null
      }
      accountTimezone={tz.timezone}
      onTimezoneChange={handleTimezoneChange}
      loading={isLoading}
      onCreateWithAi={nav.handleCreateWithAi}
      onCreateManually={nav.handleCreateManually}
      // Plain .mutate: a rejected toggle/delete/stop would be an unhandled
      // rejection, and call() already toasts each failure.
      onToggle={(id, enabled) =>
        updateRoutine.mutate({ routineId: id, updates: { enabled } })
      }
      onSaveRoutine={handleSaveRoutine}
      onEditWithAi={nav.handleEditWithAi}
      onDeleteRoutine={(routineId) => deleteRoutine.mutate(routineId)}
      // Manual runs are the intentional analytics signal for routine usage.
      onRunNow={(routineId) => {
        analytics.track("routine_executed", { routine_id: routineId });
        runNow.mutate(routineId);
      }}
      onStopRun={(routineId, runId) => cancelRun.mutate({ routineId, runId })}
      onResumeDraft={nav.handleResumeDraft}
      onDiscardDraft={handleDiscardDraft}
      aiIcon={<HoustonLogo size={14} />}
      labels={labels.grid}
      rowLabels={labels.rowLabels}
      scheduleSummaryLabels={labels.schedule.summary}
      scheduleLabels={labels.schedule}
      nextFireLabels={labels.nextFire}
      locale={labels.locale}
    />
  );
}
