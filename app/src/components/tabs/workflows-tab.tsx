import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkflowsGrid, WorkflowEditor } from "@houston-ai/workflows";
import type { WorkflowFormData } from "@houston-ai/workflows";
import {
  EMPTY_FORM,
  formMatchesWorkflow,
  freshWorkflowsState,
  latestRunByWorkflow,
  workflowToFormData,
  type View,
} from "./workflows-tab-model";
import {
  useWorkflows,
  useWorkflowRuns,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useRunWorkflow,
  useApproveWorkflowRun,
  useCancelWorkflowRun,
  useResumeWorkflowRun,
} from "../../hooks/queries";
import { useActiveRunLabels } from "../../hooks/use-active-run-labels";
import type { TabProps } from "../../lib/types";

export default function WorkflowsTab({ agent }: TabProps) {
  const { t } = useTranslation("workflows");
  const path = agent.folderPath;

  const { data: workflows, isLoading } = useWorkflows(path);
  const { data: allRuns } = useWorkflowRuns(path);
  const createWorkflow = useCreateWorkflow(path);
  const updateWorkflow = useUpdateWorkflow(path);
  const deleteWorkflow = useDeleteWorkflow(path);
  const runWorkflow = useRunWorkflow(path);
  const approveRun = useApproveWorkflowRun(path);
  const cancelRun = useCancelWorkflowRun(path);
  const resumeRun = useResumeWorkflowRun(path);

  const [view, setView] = useState<View>(() => freshWorkflowsState().view);
  const [form, setForm] = useState<WorkflowFormData>(
    () => freshWorkflowsState().form,
  );
  const [baseline, setBaseline] = useState<WorkflowFormData>(
    () => freshWorkflowsState().baseline,
  );

  const [trackedAgentId, setTrackedAgentId] = useState(agent.id);
  if (trackedAgentId !== agent.id) {
    setTrackedAgentId(agent.id);
    const fresh = freshWorkflowsState();
    setView(fresh.view);
    setForm(fresh.form);
    setBaseline(fresh.baseline);
  }

  const lastRuns = useMemo(() => latestRunByWorkflow(allRuns), [allRuns]);
  const { runStatus: runStatusLabels, activeRun } = useActiveRunLabels();

  const editorLabels = useMemo(
    () => ({
      newWorkflow: t("editor.newWorkflow"),
      untitled: t("editor.untitled"),
      backAria: t("editor.backAria"),
      run: t("editor.run"),
      starting: t("editor.starting"),
      stop: t("editor.stop"),
      resume: t("editor.resume"),
      save: t("editor.save"),
      create: t("editor.create"),
      delete: t("editor.delete"),
      moreAria: t("editor.moreAria"),
      nameLabel: t("editor.nameLabel"),
      namePlaceholder: t("editor.namePlaceholder"),
      descriptionLabel: t("editor.descriptionLabel"),
      descriptionPlaceholder: t("editor.descriptionPlaceholder"),
      planPromptLabel: t("editor.planPromptLabel"),
      planPromptPlaceholder: t("editor.planPromptPlaceholder"),
      recentRuns: t("editor.recentRuns"),
      activeRun,
      runHistory: {
        empty: t("history.empty"),
        resume: t("history.resume"),
        cancel: t("history.cancel"),
        view: t("history.view"),
        needsApproval: t("history.needsApproval"),
        steps_one: t("history.steps_one"),
        steps_other: t("history.steps_other"),
        stepsDone: t("history.stepsDone"),
        runStatus: runStatusLabels,
      },
    }),
    [t, activeRun, runStatusLabels],
  );

  const handleCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setView({ type: "editor" });
  }, []);

  const openEditor = useCallback(
    (workflowId: string) => {
      const w = workflows?.find((x) => x.id === workflowId);
      if (!w) return;
      const next = workflowToFormData(w);
      setForm(next);
      setBaseline(next);
      setView({ type: "editor", editId: workflowId });
    },
    [workflows],
  );

  const handleSubmit = useCallback(async () => {
    if (view.type !== "editor") return;
    if (view.editId) {
      const updated = await updateWorkflow.mutateAsync({
        workflowId: view.editId,
        updates: form,
      });
      setBaseline(workflowToFormData(updated));
    } else {
      await createWorkflow.mutateAsync(form);
      setView({ type: "grid" });
    }
  }, [view, form, createWorkflow, updateWorkflow]);

  const handleDelete = useCallback(
    async (workflowId: string) => {
      await deleteWorkflow.mutateAsync(workflowId);
      setView({ type: "grid" });
    },
    [deleteWorkflow],
  );

  const handleRun = useCallback(
    (workflowId: string) => {
      runWorkflow.mutate(workflowId);
    },
    [runWorkflow],
  );

  const handleApprove = useCallback(
    (runId: string) => {
      approveRun.mutate(runId);
    },
    [approveRun],
  );

  const handleCancelRun = useCallback(
    (runId: string) => {
      cancelRun.mutate(runId);
    },
    [cancelRun],
  );

  const handleResumeRun = useCallback(
    (runId: string) => {
      resumeRun.mutate(runId);
    },
    [resumeRun],
  );

  if (view.type === "editor") {
    const editing = view.editId
      ? workflows?.find((w) => w.id === view.editId)
      : undefined;
    const editingRuns = view.editId
      ? (allRuns ?? []).filter((r) => r.workflow_id === view.editId)
      : [];

    return (
      <WorkflowEditor
        value={form}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onBack={() => setView({ type: "grid" })}
        onSubmit={handleSubmit}
        workflow={editing}
        runs={editingRuns}
        onRun={editing ? () => handleRun(editing.id) : undefined}
        runPending={runWorkflow.isPending}
        onApproveRun={handleApprove}
        approvePending={approveRun.isPending}
        onCancelRun={handleCancelRun}
        onResumeRun={handleResumeRun}
        onDelete={editing ? () => handleDelete(editing.id) : undefined}
        hasChanges={!formMatchesWorkflow(form, baseline)}
        labels={editorLabels}
      />
    );
  }

  return (
    <WorkflowsGrid
      workflows={workflows ?? []}
      lastRuns={lastRuns}
      loading={isLoading}
      onSelect={openEditor}
      onCreate={handleCreate}
      labels={{
        loading: t("loading"),
        emptyTitle: t("grid.emptyTitle"),
        emptyDescription: t("grid.emptyDescription"),
        descriptionShort: t("grid.descriptionShort"),
        newWorkflow: t("grid.newWorkflow"),
        row: {
          untitled: t("row.untitled"),
          noRunsYet: t("row.noRunsYet"),
          justRan: t("row.justRan"),
          ranMinutesAgo: t("row.ranMinutesAgo"),
          ranHoursAgo: t("row.ranHoursAgo"),
          ranDaysAgo: t("row.ranDaysAgo"),
          runStatus: runStatusLabels,
        },
      }}
    />
  );
}
