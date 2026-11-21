import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { routineRunsQueryOptions, useRoutines } from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import type { Agent } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";
import { RoutineScreen } from "../../agent/routine-screen";
import type { Selection } from "../../agent/routines-tab-model";
import { selectionRoutineId } from "../../agent/routines-tab-model";
import { RoutinesTabPane } from "../../agent/routines-tab-pane";
import { useRoutineChatSetup } from "../../agent/use-routine-chat-setup";
import { useRoutinesTabView } from "../../agent/use-routines-tab-view";
import { useIsActiveView } from "../../shell/keep-alive-views";
import { useShellDetailPanel } from "../../shell/use-shell-detail-panel";

export type TeamRoutineRequest =
  | { kind: "intake" }
  | { kind: "routine"; routineId: string }
  | { kind: "draft"; activityId: string }
  | { kind: "pending" };

interface Props {
  owner: Agent;
  request: TeamRoutineRequest;
  accountTimezone: string;
  triggerSummary?: string;
  onSelectionChange: (selection: Selection | null) => void;
}

export function TeamRoutinePanel({
  owner,
  request,
  accountTimezone,
  triggerSummary,
  onSelectionChange,
}: Props) {
  const { data: routines } = useRoutines(owner.folderPath);
  const { data: allRuns, isLoading: runsLoading } = useQuery(
    routineRunsQueryOptions(owner.folderPath),
  );
  const { capabilities } = useCapabilities();

  const chatSetup = useRoutineChatSetup(owner, routines);
  const nav = useRoutinesTabView(routines, chatSetup, owner.id);
  const { selected } = nav;

  const applied = useRef<TeamRoutineRequest | null>(null);
  const { openIntake, handleOpenRoutine, handleResumeDraft } = nav;
  useEffect(() => {
    if (applied.current === request) return;
    applied.current = request;
    if (request.kind === "pending") return;
    if (request.kind === "intake") openIntake();
    else if (request.kind === "draft") handleResumeDraft(request.activityId);
    else handleOpenRoutine(request.routineId);
  }, [request, openIntake, handleOpenRoutine, handleResumeDraft]);

  const pendingChat = useUIStore((s) => s.pendingRoutineChat);
  const awaitingPending =
    request.kind === "pending" && pendingChat?.agentId === owner.id;
  const reported = useRef(false);
  useEffect(() => {
    if (selected) reported.current = true;
    else if (
      !reported.current &&
      (awaitingPending || request.kind !== "pending")
    )
      return;
    onSelectionChange(selected);
  }, [selected, onSelectionChange, awaitingPending, request.kind]);

  const screenActive = useIsActiveView();
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  const portalContainer = screenActive ? panelContainer : null;
  const claimable = screenActive && !!selected && selected.kind !== "routine";
  useEffect(() => {
    setPanelOpen(claimable);
  }, [claimable, setPanelOpen]);

  if (!selected) return null;

  const routineId = selectionRoutineId(selected);
  const routine = routineId
    ? routines?.find((candidate) => candidate.id === routineId)
    : undefined;

  return (
    <>
      {routine && (
        <RoutineScreen
          agent={owner}
          routine={routine}
          allRuns={allRuns}
          runsLoading={runsLoading}
          triggerSummary={triggerSummary}
          accountTimezone={accountTimezone}
          escapeActive={selected.kind === "routine"}
          onBackToList={nav.deselect}
          onOpenChat={() => nav.openRoutineChat(routine.id)}
          onOpenRun={(run) => nav.openRun(routine.id, run.id)}
        />
      )}
      {selected.kind !== "routine" && (
        <RoutinesTabPane
          selected={selected}
          agent={owner}
          routines={routines}
          chatSetup={chatSetup}
          allRuns={allRuns}
          accountTimezone={accountTimezone}
          triggersAvailable={!!capabilities?.triggers}
          panelContainer={portalContainer}
          onIntakeComplete={nav.handleIntakeComplete}
          onIntakeDismiss={nav.dismissIntake}
          onIntakeSend={nav.handleIntakeComposerSend}
          onDeselect={nav.deselect}
          onBackToRoutine={nav.backToRoutine}
        />
      )}
    </>
  );
}
