import type { RoutineFormData } from "@houston-ai/routines";
import { RoutineEditor, RoutinesGrid } from "@houston-ai/routines";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCancelRoutineRun,
  useCreateRoutine,
  useDeleteRoutine,
  useRoutineRuns,
  useRoutines,
  useRunRoutineNow,
  useUpdateRoutine,
} from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { useTimezonePreference } from "../../hooks/use-timezone-preference";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-toast";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { RoutineModelControls } from "./routine-model-controls";
import { RoutineSetupChat } from "./routine-setup-chat";
import {
  EMPTY_FORM,
  formMatchesRoutine,
  freshRoutinesState,
  latestRunByRoutine,
  routineToFormData,
  type View,
} from "./routines-tab-model";
import { useRoutineChatSetup } from "./use-routine-chat-setup";
import { useRoutineEditorSync } from "./use-routine-editor-sync";

export default function RoutinesTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();
  const path = agent.folderPath;
  const tz = useTimezonePreference();
  const addToast = useUIStore((s) => s.addToast);
  const viewMode = useUIStore((s) => s.viewMode);

  const { data: routines, isLoading } = useRoutines(path);
  const { data: allRuns } = useRoutineRuns(path);
  const createRoutine = useCreateRoutine(path);
  const updateRoutine = useUpdateRoutine(path);
  const deleteRoutine = useDeleteRoutine(path);
  const runNow = useRunRoutineNow(path);
  const cancelRun = useCancelRoutineRun(path);

  const [view, setView] = useState<View>(() => freshRoutinesState().view);
  const chatSetup = useRoutineChatSetup(agent, routines);
  const [form, setForm] = useState<RoutineFormData>(
    () => freshRoutinesState().form,
  );
  const [baseline, setBaseline] = useState<RoutineFormData>(
    () => freshRoutinesState().baseline,
  );

  // `view`/`form`/`baseline` describe a routine belonging to ONE agent, but
  // this RoutinesTab instance is reused across agents — it's keyed by tab, not
  // agent (see experience-renderer.tsx + workspace-shell.tsx; board-tab.tsx
  // reconciles its own per-agent selection the same way). When the active agent
  // changes we reset to that agent's grid during render (React's "adjust state
  // on prop change" pattern: the render-phase setState re-renders before the
  // stale editor ever paints), so an edit started under one agent never bleeds
  // into another agent's Routines tab.
  const [trackedAgentId, setTrackedAgentId] = useState(agent.id);
  if (trackedAgentId !== agent.id) {
    setTrackedAgentId(agent.id);
    const fresh = freshRoutinesState();
    setView(fresh.view);
    setForm(fresh.form);
    setBaseline(fresh.baseline);
  }

  // Most recent run per routine, for the grid's "last run" badges.
  const lastRuns = useMemo(() => latestRunByRoutine(allRuns), [allRuns]);

  const editing =
    view.type === "editor" && view.editId
      ? routines?.find((r) => r.id === view.editId)
      : undefined;

  // The chat beside the current view: the opened routine's persisted chat,
  // or the draft create-chat (new-routine editor AND the grid banner).
  const setupActivity = editing
    ? chatSetup.activityFor(editing)
    : (chatSetup.draftActivity ?? null);

  const openEditor = useCallback(
    (routineId: string) => {
      const r = routines?.find((x) => x.id === routineId);
      if (!r) return;
      const next = routineToFormData(r);
      setForm(next);
      setBaseline(next);
      setView({ type: "editor", editId: routineId });
      // The chat always rides along (HOU-725): resume the routine's own
      // persisted chat, or start (and link) one on its first open.
      if (chatSetup.activityFor(r)) chatSetup.openPanel();
      else void chatSetup.startForRoutine(r);
    },
    [routines, chatSetup],
  );

  // "New routine": empty form on the left, guided chat on the right — both
  // at once, no chooser (HOU-725). The banner's Continue does the same.
  const handleCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setView({ type: "editor" });
    void chatSetup.startDraft();
  }, [chatSetup]);

  const draftIdRef = useRoutineEditorSync({
    agentId: agent.id,
    view,
    routines,
    form,
    baseline,
    draftActivityId: chatSetup.draftActivity?.id,
    openEditor,
    setForm,
    setBaseline,
  });

  // While a routine is open on the active Routines tab, its chat stays open
  // — the panel is part of the view (HOU-725), so any stray close (a tab
  // round-trip drops the shared panel container, another surface steals it)
  // reopens it and the previous conversation is right there to continue.
  const panelOpenAgentId = useUIStore((s) => s.routineSetupChatAgentId);
  useEffect(() => {
    if (viewMode !== "routines" || view.type !== "editor") return;
    if (!setupActivity || panelOpenAgentId === agent.id) return;
    chatSetup.openPanel();
  }, [viewMode, view, setupActivity, panelOpenAgentId, agent.id, chatSetup]);

  const handleSubmit = useCallback(async () => {
    if (view.type !== "editor") return;
    if (view.editId) {
      const updated = await updateRoutine.mutateAsync({
        routineId: view.editId,
        updates: form,
      });
      // Reset baseline so the Save button disables until the next edit.
      setBaseline(routineToFormData(updated));
    } else {
      // Claim the draft chat: this form and that chat were creating the same
      // routine, so the conversation stays attached to it (HOU-725).
      const draftId = draftIdRef.current;
      const created = await createRoutine.mutateAsync({
        ...form,
        ...(draftId ? { setup_activity_id: draftId } : {}),
      });
      analytics.track("routine_scheduled", { routine_id: created.id });
      const next = routineToFormData(created);
      setForm(next);
      setBaseline(next);
      setView({ type: "editor", editId: created.id });
    }
  }, [view, form, createRoutine, updateRoutine, draftIdRef]);

  const handleToggle = useCallback(
    async (routineId: string, enabled: boolean) => {
      await updateRoutine.mutateAsync({ routineId, updates: { enabled } });
    },
    [updateRoutine],
  );

  const handleDelete = useCallback(
    async (routineId: string) => {
      await deleteRoutine.mutateAsync(routineId);
      setView({ type: "grid" });
    },
    [deleteRoutine],
  );

  const handleRename = useCallback(
    async (routineId: string, name: string) => {
      await updateRoutine.mutateAsync({ routineId, updates: { name } });
    },
    [updateRoutine],
  );

  const handleRunNow = useCallback(
    (routineId: string) => {
      // Tracks user-initiated runs only ("Run now" button). Scheduled cron
      // runs that the engine triggers in the background are not counted
      // here — wiring those would need a dedicated engine event (the
      // existing RoutineRunsChanged also fires on status updates, which
      // would over-count). Manual runs are the cleaner signal anyway:
      // they tell us users are USING the feature actively.
      analytics.track("routine_executed", { routine_id: routineId });
      runNow.mutate(routineId);
    },
    [runNow],
  );

  const handleCancelRun = useCallback(
    (routineId: string, runId: string) => {
      cancelRun.mutate({ routineId, runId });
    },
    [cancelRun],
  );

  // Single patch-merge for editor field edits, shared by RoutineEditor and the
  // model/effort controls. A picked provider/model/effort pins it on the form;
  // untouched fields stay null so the run inherits the agent's config.
  const handleFormChange = useCallback(
    (patch: Partial<RoutineFormData>) =>
      setForm((prev) => ({ ...prev, ...patch })),
    [],
  );

  // The timezone is a single account-wide preference (not per-routine), so the
  // routines list's picker writes straight to it. Changing it re-times every
  // routine, which the engine scheduler picks up on the next sync.
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

  // `useTimezonePreference` auto-seeds on first call, so `tz.timezone` is
  // non-null from the first render. We still wait for the roundtrip to
  // finish so the cron schedule renders against the real zone instead of
  // an empty placeholder.
  if (!tz.loaded || !tz.timezone) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">
          {t("loading")}
        </p>
      </div>
    );
  }

  if (view.type === "editor") {
    const editingRuns = view.editId
      ? (allRuns ?? []).filter((r) => r.routine_id === view.editId)
      : [];

    // data-keep-panel-open: interacting with routines content must not
    // dismiss the setup-chat panel via AIBoard's outside-click close.
    return (
      <div className="contents" data-keep-panel-open>
        <RoutineSetupChat
          agent={agent}
          agentDef={agentDef}
          activity={setupActivity}
          showBanner={false}
          dismissable={false}
          onContinue={chatSetup.openPanel}
        />
        <RoutineEditor
          value={form}
          onChange={handleFormChange}
          onBack={() => setView({ type: "grid" })}
          onSubmit={handleSubmit}
          routine={editing}
          runs={editingRuns}
          onRunNow={editing ? () => handleRunNow(editing.id) : undefined}
          runNowPending={runNow.isPending}
          onCancelRun={
            editing
              ? (runId: string) => handleCancelRun(editing.id, runId)
              : undefined
          }
          onToggle={
            editing ? (enabled) => handleToggle(editing.id, enabled) : undefined
          }
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
          accountTimezone={tz.timezone}
          hasChanges={!formMatchesRoutine(form, baseline)}
          modelPicker={
            <RoutineModelControls
              agent={agent}
              agentPath={path}
              form={form}
              onChange={handleFormChange}
            />
          }
          labels={labels.editor}
          scheduleLabels={labels.schedule}
          nextFireLabels={labels.nextFire}
          runHistoryLabels={labels.runHistory}
          locale={labels.locale}
        />
      </div>
    );
  }

  return (
    <div className="contents" data-keep-panel-open>
      <RoutineSetupChat
        agent={agent}
        agentDef={agentDef}
        activity={chatSetup.draftActivity ?? null}
        showBanner
        dismissable
        onContinue={handleCreate}
      />
      <RoutinesGrid
        routines={routines ?? []}
        lastRuns={lastRuns}
        accountTimezone={tz.timezone}
        onTimezoneChange={handleTimezoneChange}
        loading={isLoading}
        onSelect={openEditor}
        onCreate={handleCreate}
        onToggle={handleToggle}
        onRename={handleRename}
        onDelete={handleDelete}
        labels={labels.grid}
        rowLabels={labels.rowLabels}
        scheduleSummaryLabels={labels.schedule.summary}
        nextFireLabels={labels.nextFire}
        locale={labels.locale}
      />
    </div>
  );
}
