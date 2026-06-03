import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutinesGrid, RoutineEditor } from "@houston-ai/routines";
import type { RoutineFormData } from "@houston-ai/routines";
import {
  EMPTY_FORM,
  formMatchesRoutine,
  freshRoutinesState,
  latestRunByRoutine,
  routineToFormData,
  type View,
} from "./routines-tab-model";
import {
  useRoutines,
  useRoutineRuns,
  useCreateRoutine,
  useUpdateRoutine,
  useDeleteRoutine,
  useRunRoutineNow,
  useCancelRoutineRun,
} from "../../hooks/queries";
import { useTimezonePreference } from "../../hooks/use-timezone-preference";
import { analytics } from "../../lib/analytics";
import type { TabProps } from "../../lib/types";

export default function RoutinesTab({ agent }: TabProps) {
  const { t } = useTranslation("routines");
  const path = agent.folderPath;
  const tz = useTimezonePreference();

  const { data: routines, isLoading } = useRoutines(path);
  const { data: allRuns } = useRoutineRuns(path);
  const createRoutine = useCreateRoutine(path);
  const updateRoutine = useUpdateRoutine(path);
  const deleteRoutine = useDeleteRoutine(path);
  const runNow = useRunRoutineNow(path);
  const cancelRun = useCancelRoutineRun(path);

  const [view, setView] = useState<View>(() => freshRoutinesState().view);
  const [form, setForm] = useState<RoutineFormData>(() => freshRoutinesState().form);
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

  const handleCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setView({ type: "editor" });
  }, []);

  const openEditor = useCallback(
    (routineId: string) => {
      const r = routines?.find((x) => x.id === routineId);
      if (!r) return;
      const next = routineToFormData(r);
      setForm(next);
      setBaseline(next);
      setView({ type: "editor", editId: routineId });
    },
    [routines],
  );

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
      const created = await createRoutine.mutateAsync(form);
      analytics.track("routine_scheduled", { routine_id: created.id });
      setView({ type: "grid" });
    }
  }, [view, form, createRoutine, updateRoutine]);

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

  // `useTimezonePreference` auto-seeds on first call, so `tz.timezone` is
  // non-null from the first render. We still wait for the roundtrip to
  // finish so the cron schedule renders against the real zone instead of
  // an empty placeholder.
  if (!tz.loaded || !tz.timezone) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">{t("loading")}</p>
      </div>
    );
  }

  if (view.type === "editor") {
    const editing = view.editId
      ? routines?.find((r) => r.id === view.editId)
      : undefined;
    const editingRuns = view.editId
      ? (allRuns ?? []).filter((r) => r.routine_id === view.editId)
      : [];

    return (
      <RoutineEditor
        value={form}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
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
      />
    );
  }

  return (
    <RoutinesGrid
      routines={routines ?? []}
      lastRuns={lastRuns}
      accountTimezone={tz.timezone}
      loading={isLoading}
      onSelect={openEditor}
      onCreate={handleCreate}
      onToggle={handleToggle}
      labels={{
        loading: t("loading"),
        emptyTitle: t("grid.emptyTitle"),
        emptyDescription: t("grid.emptyDescription"),
        descriptionShort: t("grid.descriptionShort"),
        newRoutine: t("grid.newRoutine"),
      }}
    />
  );
}
