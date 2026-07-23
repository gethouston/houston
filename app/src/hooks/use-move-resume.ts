import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getEngine, newEngineActive } from "../lib/engine";
import { resumePendingMove } from "../lib/move-resume";
import {
  claimMove,
  clearPendingMove,
  readPendingMoves,
  releaseMove,
  updatePendingMoveId,
} from "../lib/pending-move";
import { queryKeys } from "../lib/query-keys";
import { isExpectedShareError, shareErrorCode } from "../lib/share-via-team";
import { tauriOrg } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";

/**
 * Boot-time healer for abandoned C8 agent moves (HOU-817).
 *
 * A move whose driver vanished (dialog closed, app quit, poll timed out)
 * leaves the gateway's durable lock in place, and a locked agent cannot wake:
 * every request answers 503 "agent is being moved", which reads as a fully
 * broken app. On each boot of a spaces-capable host this re-drives every
 * persisted pending move to terminal: poll the recorded ticket, re-POST to
 * stale-adopt when it reads failed, and clear the record only on `done`.
 * Success and failure both toast — a silently healed (or still-stuck) agent
 * would hide what happened to it.
 *
 * `enabled` MUST be the signed-in state: the capabilities probe (and every
 * move call) is authenticated on hosted deployments, so firing it on the
 * sign-in screen would only produce 401 noise.
 */
export function useMoveResume(enabled: boolean): void {
  const queryClient = useQueryClient();
  const { t } = useTranslation("teams");
  const ranRef = useRef(false);

  // A record can only have been written by a spaces-capable host, so with no
  // records this observes nothing and fetches nothing. The shared query key
  // means the shell's own `useCapabilities` consumers dedupe against this.
  const hasPending = readPendingMoves().length > 0;
  const capsQuery = useQuery({
    queryKey: queryKeys.capabilities(),
    queryFn: () => getEngine().capabilities(),
    enabled: enabled && hasPending && newEngineActive(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 3,
  });
  const spaces = capsQuery.data?.spaces === true;

  useEffect(() => {
    if (!spaces || ranRef.current) return;
    if (readPendingMoves().length === 0) return;
    ranRef.current = true;

    const addToast = useUIStore.getState().addToast;
    void (async () => {
      for (const pending of readPendingMoves()) {
        if (!claimMove(pending.agentId)) continue; // a dialog is driving it
        try {
          // `toast: false` on both wire calls: transient poll blips are
          // retried (a red toast per blip would spam boot), and a terminal
          // failure gets ONE `moveResume.failed` toast below. Unexpected
          // errors are still logged + captured to Sentry; only the expected
          // C8 business states (incl. `move_in_progress`, a normal resume
          // answer when a fresh move owns the agent) skip capture too.
          const result = await resumePendingMove(pending, {
            moveStatus: (agentId, moveId) =>
              tauriOrg.moveStatus(agentId, moveId, { toast: false }),
            moveAgent: (agentId, toSlug) =>
              tauriOrg.moveAgent(agentId, toSlug, {
                toast: false,
                silence: (err) =>
                  isExpectedShareError(err) ||
                  shareErrorCode(err) === "move_in_progress",
              }),
          });
          if (result.outcome === "done") {
            clearPendingMove(pending.agentId);
            addToast({
              title: t("moveResume.done", {
                agent: pending.agentName,
                team: pending.teamName,
              }),
              variant: "success",
            });
            // The agent changed spaces: refresh the switcher, the team list,
            // and the active workspace's sidebar.
            await useWorkspaceStore.getState().loadWorkspaces();
            await queryClient.invalidateQueries({
              queryKey: queryKeys.orgs(),
            });
            const current = useWorkspaceStore.getState().current;
            if (current) {
              await useAgentStore
                .getState()
                .loadAgents(current.id, { silent: true });
            }
          } else if (result.outcome === "inProgress") {
            // A live move already owns the agent (another window or a fresh
            // dialog is driving it) — leave the record; its driver settles it.
          } else {
            // Keep the record: the lock is still held and only a finished move
            // frees the agent, so the next boot tries again.
            if ("moveId" in result && result.moveId) {
              updatePendingMoveId(pending.agentId, result.moveId);
            }
            addToast({
              title: t("moveResume.failed", {
                agent: pending.agentName,
                team: pending.teamName,
              }),
              variant: "error",
            });
          }
        } finally {
          releaseMove(pending.agentId);
        }
      }
    })();
  }, [spaces, queryClient, t]);
}
