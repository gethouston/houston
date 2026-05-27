import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutinesGrid, RoutineEditor } from "@houston-ai/routines";
import type { RoutineFormData, RoutineRun } from "@houston-ai/routines";
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

type View = { type: "grid" } | { type: "editor"; editId?: string };

const EMPTY_FORM: RoutineFormData = {
  name: "",
  description: "",
  prompt: "",
  schedule: "0 9 * * *",
  suppress_when_silent: true,
  timezone: null,
  integrations: [],
};

function sameStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function formMatchesRoutine(
  form: RoutineFormData,
  source: RoutineFormData,
): boolean {
  return (
    form.name === source.name &&
    form.description === source.description &&
    form.prompt === source.prompt &&
    form.schedule === source.schedule &&
    form.suppress_when_silent === source.suppress_when_silent &&
    (form.timezone ?? null) === (source.timezone ?? null) &&
    sameStringList(form.integrations, source.integrations)
  );
}

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

  const [view, setView] = useState<View>({ type: "grid" });
  const [form, setForm] = useState<RoutineFormData>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<RoutineFormData>(EMPTY_FORM);

  // Compute last run per routine
  const lastRuns = useMemo(() => {
    if (!allRuns) return {};
    const map: Record<string, RoutineRun> = {};
    for (const run of allRuns) {
      const existing = map[run.routine_id];
      if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
        map[run.routine_id] = run;
      }
    }
    return map;
  }, [allRuns]);

  const handleCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setView({ type: "editor" });
  }, []);

  const openEditor = useCallback(
    (routineId: string) => {
      const r = routines?.find((x) => x.id === routineId);
      if (!r) return;
      const next: RoutineFormData = {
        name: r.name,
        description: r.description,
        prompt: r.prompt,
        schedule: r.schedule,
        suppress_when_silent: r.suppress_when_silent,
        timezone: r.timezone ?? null,
        integrations: r.integrations ?? [],
      };
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
      setBaseline({
        name: updated.name,
        description: updated.description,
        prompt: updated.prompt,
        schedule: updated.schedule,
        suppress_when_silent: updated.suppress_when_silent,
        timezone: updated.timezone ?? null,
        integrations: updated.integrations ?? [],
      });
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
