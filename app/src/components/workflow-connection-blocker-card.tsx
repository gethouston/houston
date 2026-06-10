import { useCallback, useEffect, useMemo } from "react";
import type { StepState, WorkflowRun } from "@houston-ai/workflows";
import {
  useConnectedToolkits,
  useConnections,
} from "../hooks/queries";
import { normalizeToolkitSlugs } from "../lib/composio-toolkits";
import { tauriConnections, tauriSystem } from "../lib/tauri";
import { ComposioLinkCard } from "./composio-link-card";
import { ComposioSigninCard } from "./composio-signin-card";
import {
  connectionBlockerSatisfied,
  connectionRetryKey,
} from "./workflow-connection-retry";

const attemptedRetries = new Set<string>();

interface WorkflowConnectionBlockerCardProps {
  run: WorkflowRun;
  state: StepState;
  onRetry: (runId: string, stepId: string) => void;
}

export function WorkflowConnectionBlockerCard({
  run,
  state,
  onRetry,
}: WorkflowConnectionBlockerCardProps) {
  const blocker = state.blocker;
  const { data: status } = useConnections();
  const signedIn = status?.status === "ok";
  const { data: connected } = useConnectedToolkits(signedIn);
  const connectedSet = useMemo(
    () => new Set(normalizeToolkitSlugs(connected ?? [])),
    [connected],
  );

  useEffect(() => {
    if (!blocker || state.status !== "waiting_for_connection") return;
    if (!connectionBlockerSatisfied(blocker, signedIn, connectedSet)) return;
    const key = connectionRetryKey(run.id, state.step_id, blocker);
    if (attemptedRetries.has(key)) return;
    attemptedRetries.add(key);
    onRetry(run.id, state.step_id);
  }, [blocker, connectedSet, onRetry, run.id, signedIn, state.status, state.step_id]);

  const openToolkitConnection = useCallback(async (toolkit: string) => {
    const { redirect_url } = await tauriConnections.connectApp(toolkit);
    await tauriSystem.openUrl(redirect_url);
  }, []);

  if (!blocker || state.status !== "waiting_for_connection") return null;

  return (
    <div className="mt-2">
      {blocker.type === "composio_signin" ? (
        <ComposioSigninCard />
      ) : (
        <ComposioLinkCard
          toolkit={blocker.toolkit}
          onOpen={() => openToolkitConnection(blocker.toolkit)}
        />
      )}
    </div>
  );
}
