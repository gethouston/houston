import { useCallback, useMemo, useState } from "react";

import { useTranslation } from "react-i18next";

import { InlineRunCard } from "@houston-ai/workflows";

import type { InlineRunSavePrompt } from "@houston-ai/workflows";

import {

  useApproveWorkflowRun,

  useCancelWorkflowRun,

  useRetryWorkflowStep,

  useSaveWorkflowRunAsWorkflow,

  useWorkflowRuns,

  useWorkflows,

} from "../hooks/queries";

import { useActiveRunLabels } from "../hooks/use-active-run-labels";

import { useUIStore } from "../stores/ui";



export interface InlineWorkflowRunCardProps {

  agentPath: string;

  runId: string;

  /** When false, step retry is hidden (e.g. older workflow cards in chat history). */

  allowStepRetry?: boolean;

}



export function InlineWorkflowRunCard({

  agentPath,

  runId,

  allowStepRetry = true,

}: InlineWorkflowRunCardProps) {

  const { t } = useTranslation("workflows");

  const { data: runs } = useWorkflowRuns(agentPath);

  const { data: workflows } = useWorkflows(agentPath);

  const run = runs?.find((r) => r.id === runId);

  const approve = useApproveWorkflowRun(agentPath);

  const cancel = useCancelWorkflowRun(agentPath);

  const retryStep = useRetryWorkflowStep(agentPath);

  const saveAsWorkflow = useSaveWorkflowRunAsWorkflow(agentPath);

  const addToast = useUIStore((s) => s.addToast);

  const { activeRun } = useActiveRunLabels();



  const [saveDismissed, setSaveDismissed] = useState(false);



  const dismissSavePrompt = useCallback(() => {

    setSaveDismissed(true);

  }, []);



  const handleConfirmSave = useCallback(async () => {

    if (!run) return;

    try {

      const saved = await saveAsWorkflow.mutateAsync(run.id);

      addToast({

        title: t("savePrompt.successTitle"),

        description: t("savePrompt.successDescription", { name: saved.name }),

        variant: "success",

      });

    } catch {

      // `call()` in tauriWorkflows surfaces the engine error as a toast.

    }

  }, [run, saveAsWorkflow, addToast, t]);



  const savedWorkflowName = useMemo(() => {

    if (!run?.saved_workflow_id) return null;

    return (

      workflows?.find((w) => w.id === run.saved_workflow_id)?.name ??

      run.name?.trim() ??

      null

    );

  }, [run, workflows]);



  const savePrompt = useMemo((): InlineRunSavePrompt | undefined => {

    if (!run || run.status !== "done" || !run.plan || !run.workflow_id.startsWith("inline-")) {

      return undefined;

    }



    const runTitle = run.name?.trim() || t("savePrompt.untitledRun");

    const stepCount = run.plan.steps.length;

    const labels = {

      title: t("savePrompt.title"),

      description: t("savePrompt.description", { name: runTitle, count: stepCount }),

      confirm: t("savePrompt.confirm"),

      cancel: t("savePrompt.cancel"),

      successTitle: t("savePrompt.successTitle"),

      successDescription: t("savePrompt.successDescription", {

        name: savedWorkflowName ?? runTitle,

      }),

    };



    if (run.saved_workflow_id || savedWorkflowName) {

      return {

        state: "saved",

        savedName: savedWorkflowName ?? runTitle,

        labels,

      };

    }



    if (saveDismissed) {

      return undefined;

    }



    return {

      state: "offer",

      onConfirm: handleConfirmSave,

      onDismiss: dismissSavePrompt,

      confirmPending: saveAsWorkflow.isPending,

      labels,

    };

  }, [

    run,

    t,

    savedWorkflowName,

    saveDismissed,

    handleConfirmSave,

    dismissSavePrompt,

    saveAsWorkflow.isPending,

  ]);



  if (!run) return null;



  return (

    <div className="max-w-3xl mx-auto w-full px-4 py-2">

      <InlineRunCard

        run={run}

        onApprove={() => approve.mutate(run.id)}

        onCancel={() => cancel.mutate(run.id)}

        onRetryStep={

          allowStepRetry

            ? (stepId) => retryStep.mutate({ runId: run.id, stepId })

            : undefined

        }

        retryingStepId={

          retryStep.isPending && retryStep.variables?.runId === run.id

            ? retryStep.variables.stepId

            : undefined

        }

        approvePending={approve.isPending}

        cancelPending={cancel.isPending}

        savePrompt={savePrompt}

        labels={activeRun}

      />

    </div>

  );

}


