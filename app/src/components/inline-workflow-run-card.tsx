import { InlineRunCard } from "@houston-ai/workflows";
import {
  useApproveWorkflowRun,
  useCancelWorkflowRun,
  useWorkflowRuns,
} from "../hooks/queries";
import { useActiveRunLabels } from "../hooks/use-active-run-labels";

export interface InlineWorkflowRunCardProps {
  agentPath: string;
  runId: string;
}

export function InlineWorkflowRunCard({ agentPath, runId }: InlineWorkflowRunCardProps) {
  const { data: runs } = useWorkflowRuns(agentPath);
  const run = runs?.find((r) => r.id === runId);
  const approve = useApproveWorkflowRun(agentPath);
  const cancel = useCancelWorkflowRun(agentPath);
  const { activeRun } = useActiveRunLabels();

  if (!run) return null;

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-2">
      <InlineRunCard
        run={run}
        onApprove={() => approve.mutate(run.id)}
        onCancel={() => cancel.mutate(run.id)}
        approvePending={approve.isPending}
        labels={activeRun}
      />
    </div>
  );
}
