import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  NewWorkflow,
  WorkflowRun,
  WorkflowUpdate,
} from "@houston-ai/engine-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriWorkflows } from "../../lib/tauri";

export function useWorkflows(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflows(agentPath!),
    queryFn: () => tauriWorkflows.list(agentPath!),
    enabled: !!agentPath,
  });
}

export function useWorkflowRuns(agentPath: string | undefined, workflowId?: string) {
  return useQuery({
    queryKey: queryKeys.workflowRuns(agentPath!, workflowId),
    queryFn: () => tauriWorkflows.listRuns(agentPath!, workflowId),
    enabled: !!agentPath,
  });
}

export function useCreateWorkflow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewWorkflow) => tauriWorkflows.create(agentPath, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows(agentPath) });
    },
  });
}

export function useUpdateWorkflow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      updates,
    }: {
      workflowId: string;
      updates: WorkflowUpdate;
    }) => tauriWorkflows.update(agentPath, workflowId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows(agentPath) });
    },
  });
}

export function useDeleteWorkflow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => tauriWorkflows.delete(agentPath, workflowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows(agentPath) });
    },
  });
}

export function useRunWorkflow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => tauriWorkflows.run(agentPath, workflowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-runs", agentPath] });
    },
  });
}

export function useApproveWorkflowRun(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => tauriWorkflows.approveRun(agentPath, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-runs", agentPath] });
    },
  });
}

export function useCancelWorkflowRun(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => tauriWorkflows.cancelRun(agentPath, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-runs", agentPath] });
    },
  });
}

export function useResumeWorkflowRun(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => tauriWorkflows.resumeRun(agentPath, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-runs", agentPath] });
    },
  });
}

export function useRetryWorkflowStep(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, stepId }: { runId: string; stepId: string }) =>
      tauriWorkflows.retryStep(agentPath, runId, stepId),
    onSuccess: (updatedRun: WorkflowRun) => {
      qc.setQueriesData<WorkflowRun[]>(
        { queryKey: ["workflow-runs", agentPath] },
        (old) => old?.map((r) => (r.id === updatedRun.id ? updatedRun : r)),
      );
      qc.invalidateQueries({ queryKey: ["workflow-runs", agentPath] });
    },
  });
}

export function useSaveWorkflowRunAsWorkflow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      tauriWorkflows.saveRunAsWorkflow(agentPath, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows(agentPath) });
      qc.invalidateQueries({ queryKey: ["workflow-runs", agentPath] });
    },
  });
}
