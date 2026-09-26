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
  /** The ROUTINE row to light, or null when none is open. */
  selectedRoutineKey: string | null;
  /** The DRAFT row to light, or null when none is open. A
   *  half-built routine is a row like any other, so the open chat has to light
   *  it — otherwise the list looks like nothing is selected while its chat
   *  fills the panel. */
  selectedDraftKey: string | null;
  /** Whether a chat owns the shell panel (the list gives up its centering). */
  chatOpen: boolean;
  /** Whether a routine's canonical screen replaces the list. */
  screenOpen: boolean;
  /** Row click: open that routine's chat, or close it when it is already open. */
  openRoutineChat: (routineId: string) => void;
  /** Draft row click: reopen the setup chat that is still building it. */
  resumeDraft: (activityId: string) => void;
  /** "New routine": straight to the employee's intake. */
  startNewRoutine: () => void;
  /** The chat host. Rendered by the section; it adds no layout of its own
   *  (the chat portals into the shell panel). */
  node: ReactNode;
}

/**
 * The employee's Routines section chat wiring: whether the chat is open, what
 * it was asked to show, and what it reports back.
 *
 * The section cannot own the selection itself — the chat's machinery is
 * per-agent (see {@link TeamRoutinePanel}) — so this is a REQUEST/REPORT seam
 * rather than a controlled hook: the section names an intent, the
 * child applies it once through the existing state machine, and the child says
 * what it actually ended up showing. That report is what lights the row (an
 * intake that becomes a draft that becomes a real routine moves the highlight
 * from the draft row to the routine's on its own) and what closes the panel
 * when the chat closes.
 */
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

  // A session-finished notification for a routine chat lands here (see
  // `usePendingTeamRoutineChat`). The request is `pending`, not a selection:
  // only the per-agent machinery inside the chat knows whether the id is a
  // routine's chat or an unclaimed draft.
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
          ? // Re-clicking the open row closes it, as it does on the tab.
            null
          : { kind: "routine", routineId },
      );
    },
    [list],
  );

  // A draft row never toggles closed on re-click: unlike a routine, the chat is
  // the only thing the row IS, and the person clicking it again is reaching for
  // the conversation, not dismissing it.
  const resumeDraft = useCallback((activityId: string) => {
    setSelection(null);
    setRequest({ kind: "draft", activityId });
  }, []);

  const handleSelectionChange = useCallback((next: Selection | null) => {
    setSelection(next);
    // The chat closed itself (its X, Escape, a failed start): drop the host so
    // the panel claim goes with it.
    if (next === null) setRequest(null);
  }, []);

  const routineId = selectionRoutineId(selection);
  return {
    selectedRoutineKey: routineId,
    // `activityId` is null for the beat between the intake completing and the
    // draft chat existing; there is no row to light yet either.
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
