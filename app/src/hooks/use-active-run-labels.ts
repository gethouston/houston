import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ActiveRunPanelLabels } from "@houston-ai/workflows";
import type { WorkflowRunStatus, WorkflowStepStatus } from "@houston-ai/workflows";

export function useActiveRunLabels(): {
  runStatus: Record<WorkflowRunStatus, string>;
  stepStatus: Record<WorkflowStepStatus, string>;
  activeRun: ActiveRunPanelLabels;
} {
  const { t } = useTranslation("workflows");

  const runStatus = useMemo(
    () => ({
      planning: t("runStatus.planning"),
      awaiting_approval: t("runStatus.awaiting_approval"),
      running: t("runStatus.running"),
      done: t("runStatus.done"),
      error: t("runStatus.error"),
      cancelled: t("runStatus.cancelled"),
    }),
    [t],
  );

  const stepStatus = useMemo(
    () => ({
      pending: t("stepStatus.pending"),
      awaiting_approval: t("stepStatus.awaiting_approval"),
      running: t("stepStatus.running"),
      done: t("stepStatus.done"),
      error: t("stepStatus.error"),
      cancelled: t("stepStatus.cancelled"),
    }),
    [t],
  );

  const activeRun = useMemo(
    (): ActiveRunPanelLabels => ({
      title: t("activeRun.title"),
      completedTitle: t("activeRun.completedTitle"),
      actionTitle: t("activeRun.actionTitle"),
      planning: t("activeRun.planning"),
      synthesis: t("activeRun.synthesis"),
      reviewPlan: t("activeRun.reviewPlan"),
      reviewAction: t("activeRun.reviewAction"),
      approve: t("activeRun.approve"),
      actionApprove: t("activeRun.actionApprove"),
      cancel: t("activeRun.cancel"),
      stop: t("activeRun.stop"),
      runStatus,
      approvalDialog: {
        title: t("approval.title"),
        description: t("approval.description"),
        approve: t("approval.approve"),
        cancel: t("approval.cancel"),
        approving: t("approval.approving"),
        stepProgress: {
          runsTogether: t("stepProgress.runsTogether"),
          stepStatus,
        },
      },
      actionApprovalDialog: {
        title: t("actionApproval.title"),
        description: t("actionApproval.description"),
        approve: t("actionApproval.approve"),
        cancel: t("actionApproval.cancel"),
        approving: t("actionApproval.approving"),
        stepProgress: {
          runsTogether: t("stepProgress.runsTogether"),
          stepStatus,
        },
      },
      stepProgress: {
        runsTogether: t("stepProgress.runsTogether"),
        retry: t("stepProgress.retry"),
        stepStatus,
      },
    }),
    [t, runStatus, stepStatus],
  );

  return { runStatus, stepStatus, activeRun };
}
