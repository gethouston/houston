/**
 * The running half of the cross-agent sweep's recovery (HOU-981): the state the
 * policy in `lib/all-conversations-recovery.ts` decides over, and the two side
 * effects that carry a decision out — the toast and the scheduled re-sweep.
 *
 * Split from the hook it serves so `use-conversations.ts` stays what it reads
 * as: query definitions. Everything mutable about the sweep lives here, in one
 * place, at module scope.
 */

import type { FailedAgentRead } from "@houston-ai/engine-client";
import type { QueryClient } from "@tanstack/react-query";
import { isAgentGoneError } from "../../lib/agent-gone";
import {
  NO_SWEEP_RECOVERY,
  type PartialSweepSurface,
  planSweepAttempt,
  type SweepRecoveryState,
  stepSweepRecovery,
} from "../../lib/all-conversations-recovery";
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
import { surfaceEngineError, tauriConversations } from "../../lib/tauri";
import { isTransientEngineError } from "../../lib/transient-error";

// Bookkeeping for the ONE cross-agent aggregate. Module scope, not refs: seven
// surfaces mount the hook and any of their queryFn closures may be the one
// TanStack runs for a given fetch, so per-component counters would split the
// run and re-toast. One query, one counter, one pending re-sweep.
//
// The counter is KEYED to the roster it was counted on (see stepSweepRecovery):
// unkeyed, it saturated for the session, so a user who hit three partial sweeps
// and then switched space got a board that would never again say it was
// incomplete and never again re-sweep.
let sweepRecovery: SweepRecoveryState = NO_SWEEP_RECOVERY;
let partialSweepTimer: ReturnType<typeof setTimeout> | undefined;

function cancelPendingResweep(): void {
  if (partialSweepTimer) clearTimeout(partialSweepTimer);
  partialSweepTimer = undefined;
}

/**
 * Point the bookkeeping at a roster, dropping anything the previous one left
 * behind. The pending re-sweep is the urgent half: it invalidates the whole
 * `all-conversations` PREFIX, so a timer left running by a space the user has
 * left fans out over the fleet they just switched TO.
 */
export function retargetSweepRecovery(roster: string): void {
  if (sweepRecovery.roster === roster) return;
  sweepRecovery = { roster, run: 0 };
  cancelPendingResweep();
}

/**
 * React to a settled sweep: a COMPLETE one clears the run; an incomplete one
 * surfaces itself and schedules its own re-sweep. The decision (when to
 * surface, when to retry) is the pure `stepSweepRecovery`, and WHAT the
 * surface is comes from the failed reads' own errors
 * (`lib/partial-sweep-surface.ts`); this only executes both.
 */
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
  // Nothing else would revisit this hole inside the freshness window, so an
  // incomplete sweep schedules its own bounded re-sweep. A sweep that came back
  // complete cancels the pending one instead: the hole is filled.
  cancelPendingResweep();
  if (decision.retryInMs === undefined) return;
  partialSweepTimer = setTimeout(() => {
    partialSweepTimer = undefined;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.allConversations([]),
    });
  }, decision.retryInMs);
}

/**
 * Tell someone the sweep was incomplete, in the register the failures earn
 * (HOUSTON-APP-538, HOUSTON-APP-58Q): an asleep pod still waking / a device
 * that dropped offline get their quiet informational toasts at notice AND at
 * escalation (no Sentry — a pod can legitimately take longer to wake than the
 * whole re-sweep run, so "still waking at the end" is not a bug), everything
 * else the real error report. The per-agent reasons ride the diagnostic line
 * so the log and the report say WHY, not just who.
 */
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
      );
      return;
    case "connectivity":
      showConnectivityErrorToast(
        "list_all_conversations_partial",
        `missions ${still} for ${failedAgents.length} agent(s) while offline: ${named}`,
      );
      return;
    case "error":
      // The beta no-silent-failures path: log + analytics + Sentry capture,
      // with authored copy as the burst key and the REAL error for grouping.
      // The escalated shape gets its own source tag: "an agent's pod never
      // came up through a whole recovery run" is a different bug than "an
      // agent's read failed outright".
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

/**
 * Run the sweep, retrying an outright failure a bounded number of times.
 *
 * The retry lives HERE and not in the useQuery config because `call()` in
 * lib/tauri.ts toasts and Sentry-captures every rejection it sees: a
 * query-level `retry` turned one all-agents-down sweep into ~4 Sentry issues
 * and a stack of toasts. Every attempt runs silent (`surface: false` — still
 * logged) and the final error is surfaced once, by hand, down the same path
 * `call()` would have used.
 */
export async function sweepWithRetry(agentPaths: string[]) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await tauriConversations.listAll(agentPaths, { surface: false });
    } catch (err) {
      const next = planSweepAttempt(attempt, isTransientEngineError(err));
      if (next.surface) {
        // Same silence as the engine layer's (`tauriConversations.listAll`):
        // a sweep where EVERY agent answered "agent not found" is a stale
        // roster mid-heal, not a bug — logged, no toast, no report.
        await surfaceEngineError(
          "list_all_conversations",
          err,
          { agentCount: agentPaths.length, attempts: attempt + 1 },
          { silence: isAgentGoneError },
        );
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, next.retryInMs));
    }
  }
}
