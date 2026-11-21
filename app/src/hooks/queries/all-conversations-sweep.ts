import type { FailedAgentRead } from "@houston/engine-adapter";
import type { QueryClient } from "@tanstack/react-query";
import { isStaleRosterReadError } from "../../lib/agent-gone";
import {
  NO_SWEEP_RECOVERY,
  type PartialSweepSurface,
  planSweepAttempt,
  type SweepRecoveryState,
  stepSweepRecovery,
} from "../../lib/all-conversations-recovery";
import { tauriConversations } from "../../lib/conversations-facade";
import {
  showConnectivityErrorToast,
  showEngineWakingToast,
  showErrorToast,
} from "../../lib/error-toast";
import i18n from "../../lib/i18n";
import {
  partialSweepToastKind,
  representativeSweepFailure,
} from "../../lib/partial-sweep-surface";
import { queryKeys } from "../../lib/query-keys";
import { surfaceEngineError } from "../../lib/tauri";
import { isTransientEngineError } from "../../lib/transient-error";

let sweepRecovery: SweepRecoveryState = NO_SWEEP_RECOVERY;
let partialSweepTimer: ReturnType<typeof setTimeout> | undefined;

function cancelPendingResweep(): void {
  if (partialSweepTimer) clearTimeout(partialSweepTimer);
  partialSweepTimer = undefined;
}

export function retargetSweepRecovery(roster: string): void {
  if (sweepRecovery.roster === roster) return;
  sweepRecovery = { roster, run: 0 };
  cancelPendingResweep();
}

export function recoverFromSweep(
  failedAgents: FailedAgentRead[],
  roster: string,
  queryClient: QueryClient,
): void {
  const { state, decision } = stepSweepRecovery(
    sweepRecovery,
    roster,
    failedAgents.length,
  );
  sweepRecovery = state;
  if (decision.surface) surfacePartialSweep(decision.surface, failedAgents);
  cancelPendingResweep();
  if (decision.retryInMs === undefined) return;
  partialSweepTimer = setTimeout(() => {
    partialSweepTimer = undefined;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.allConversations([]),
    });
  }, decision.retryInMs);
}

function surfacePartialSweep(
  surface: PartialSweepSurface,
  failedAgents: FailedAgentRead[],
): void {
  const reason = representativeSweepFailure(failedAgents.map((f) => f.reason));
  const named = failedAgents
    .map((f) => `${f.agentPath} (${describeReason(f.reason)})`)
    .join(", ");
  const still =
    surface === "escalate" ? "still unread after re-sweeps" : "unread";
  switch (partialSweepToastKind(reason)) {
    case "waking":
      showEngineWakingToast(
        "list_all_conversations_partial",
        `missions ${still} for ${failedAgents.length} waking agent(s): ${named}`,
        reason,
      );
      return;
    case "connectivity":
      showConnectivityErrorToast(
        "list_all_conversations_partial",
        `missions ${still} for ${failedAgents.length} agent(s) while offline: ${named}`,
        reason,
      );
      return;
    case "error":
      showErrorToast(
        surface === "escalate"
          ? "list_all_conversations_stuck"
          : "list_all_conversations_partial",
        surface === "escalate"
          ? `missions still unread after re-sweeps for ${failedAgents.length} agent(s): ${named}`
          : `missions unread for ${failedAgents.length} agent(s): ${named}`,
        reason,
        { userMessage: i18n.t("dashboard:errors.partialMissionLoad") },
      );
      return;
  }
}

const describeReason = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

export async function sweepWithRetry(
  agentPaths: string[],
  signal?: AbortSignal,
) {
  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await tauriConversations.listAll(
        agentPaths,
        { surface: false },
        signal,
      );
    } catch (err) {
      if (signal?.aborted) throw err;
      const next = planSweepAttempt(attempt, isTransientEngineError(err));
      if (next.surface) {
        await surfaceEngineError(
          "list_all_conversations",
          err,
          { agentCount: agentPaths.length, attempts: attempt + 1 },
          { silence: isStaleRosterReadError },
        );
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, next.retryInMs));
    }
  }
}
