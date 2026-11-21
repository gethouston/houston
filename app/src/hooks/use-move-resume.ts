import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getEngine, newEngineActive } from "../lib/engine";
import { logAndReportError } from "../lib/error-report";
import { resumePendingMove } from "../lib/move-resume";
import { moveWire } from "../lib/move-wire";
import {
  claimMove,
  clearPendingMove,
  readPendingMoves,
  releaseMove,
  updatePendingMoveId,
} from "../lib/pending-move";
import { readPendingTeamMoves } from "../lib/pending-team-move";
import { queryKeys } from "../lib/query-keys";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";

export function useMoveResume(enabled: boolean): void {
  const queryClient = useQueryClient();
  const { t } = useTranslation("teams");
  const ranRef = useRef(false);

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
        if (
          readPendingTeamMoves(undefined, (error) =>
            logAndReportError("read_pending_team_moves", error),
          ).some((team) => team.agentIds.includes(pending.agentId))
        )
          continue;
        if (!claimMove(pending.agentId)) continue;
        try {
          const result = await resumePendingMove(pending, moveWire, {
            onMoveAccepted: (moveId) =>
              updatePendingMoveId(pending.agentId, moveId),
          });
          if (result.outcome === "done" || result.outcome === "gone") {
            clearPendingMove(pending.agentId);
            if (result.outcome === "done")
              addToast({
                title: t("moveResume.done", {
                  agent: pending.agentName,
                  team: pending.teamName,
                }),
                variant: "success",
              });
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
          } else if (result.outcome === "refused") {
            clearPendingMove(pending.agentId);
            addToast({
              title: t("moveResume.nameTaken", {
                agent: pending.agentName,
                team: pending.teamName,
              }),
              variant: "info",
            });
          } else if (result.outcome === "inProgress") {
          } else {
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
