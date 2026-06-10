import type { WorkflowConnectionBlocker } from "@houston-ai/workflows";

const normalizeToolkit = (toolkit: string) => toolkit.trim().toLowerCase();

export function connectionBlockerSatisfied(
  blocker: WorkflowConnectionBlocker,
  signedIn: boolean,
  connectedToolkits: ReadonlySet<string>,
): boolean {
  if (blocker.type === "composio_signin") return signedIn;
  return connectedToolkits.has(normalizeToolkit(blocker.toolkit));
}

export function connectionRetryKey(
  runId: string,
  stepId: string,
  blocker: WorkflowConnectionBlocker,
): string {
  const target =
    blocker.type === "composio_toolkit"
      ? normalizeToolkit(blocker.toolkit)
      : blocker.type;
  return `${runId}:${stepId}:${target}`;
}
