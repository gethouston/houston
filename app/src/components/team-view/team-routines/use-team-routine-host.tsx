import { type ReactNode, useCallback, useState } from "react";
import type { Agent } from "../../../lib/types";
import {
  type Selection,
  selectionRoutineId,
} from "../../agent/routines-tab-model";
import type { TeamRoutinesList } from "../team-routines-model";
import {
  TeamRoutinePanel,
  type TeamRoutineRequest,
} from "./team-routine-panel";
import { usePendingTeamRoutineChat } from "./use-pending-team-routine-chat";

export interface TeamRoutineHost {
  selectedRoutineKey: string | null;
  selectedDraftKey: string | null;
  chatOpen: boolean;
  screenOpen: boolean;
  openRoutineChat: (routineId: string) => void;
  resumeDraft: (activityId: string) => void;
  startNewRoutine: () => void;
  node: ReactNode;
}

export function useTeamRoutineHost({
  agent,
  list,
  accountTimezone,
  triggerSummaries,
}: {
  agent: Agent;
  list: TeamRoutinesList;
  accountTimezone: string;
  triggerSummaries: Record<string, string>;
}): TeamRoutineHost {
  const [request, setRequest] = useState<TeamRoutineRequest | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const openPending = useCallback(() => {
    setSelection(null);
    setRequest({ kind: "pending" });
  }, []);
  usePendingTeamRoutineChat({ agent, onOpen: openPending });

  const startNewRoutine = useCallback(() => {
    setSelection(null);
    setRequest({ kind: "intake" });
  }, []);

  const openRoutineChat = useCallback(
    (routineId: string) => {
      if (!list.routines.some((routine) => routine.id === routineId)) return;
      setSelection(null);
      setRequest((current) =>
        current?.kind === "routine" && current.routineId === routineId
          ? null
          : { kind: "routine", routineId },
      );
    },
    [list],
  );

  const resumeDraft = useCallback((activityId: string) => {
    setSelection(null);
    setRequest({ kind: "draft", activityId });
  }, []);

  const handleSelectionChange = useCallback((next: Selection | null) => {
    setSelection(next);
    if (next === null) setRequest(null);
  }, []);

  const routineId = selectionRoutineId(selection);
  return {
    selectedRoutineKey: routineId,
    selectedDraftKey:
      selection?.kind === "draft" && selection.activityId
        ? selection.activityId
        : null,
    chatOpen:
      selection?.kind === "intake" ||
      selection?.kind === "draft" ||
      selection?.kind === "routineChat" ||
      selection?.kind === "runChat",
    screenOpen:
      selection?.kind === "routine" ||
      selection?.kind === "routineChat" ||
      selection?.kind === "runChat",
    openRoutineChat,
    resumeDraft,
    startNewRoutine,
    node: request && (
      <TeamRoutinePanel
        key={agent.id}
        owner={agent}
        request={request}
        accountTimezone={accountTimezone}
        triggerSummary={
          selection && "routineId" in selection
            ? triggerSummaries[selection.routineId]
            : undefined
        }
        onSelectionChange={handleSelectionChange}
      />
    ),
  };
}
