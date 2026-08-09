import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../../lib/types";
import {
  type Selection,
  selectionRoutineId,
} from "../../agent/routines-tab-model";
import { AgentPickerDialog } from "../../agent-picker-dialog";
import type { TeamRoutineDraftsList } from "../team-routine-drafts-model";
import { type TeamRoutinesList, teamRoutineKey } from "../team-routines-model";
import {
  TeamRoutinePanel,
  type TeamRoutineRequest,
} from "./team-routine-panel";
import { usePendingTeamRoutineChat } from "./use-pending-team-routine-chat";

/** Which owner's chat is open, and what it was asked to show. */
interface OpenChat {
  agentId: string;
  request: TeamRoutineRequest;
}

export interface TeamRoutineHost {
  /** The namespaced ROUTINE row key to light, or null when none is open. */
  selectedRoutineKey: string | null;
  /** The namespaced DRAFT row key to light, or null when none is open. A
   *  half-built routine is a row like any other, so the open chat has to light
   *  it — otherwise the list looks like nothing is selected while its chat
   *  fills the panel. */
  selectedDraftKey: string | null;
  /** Whether a chat owns the shell panel (the list gives up its centering). */
  chatOpen: boolean;
  /** Whether a routine's canonical screen replaces the list. */
  screenOpen: boolean;
  /** Row click: open that routine's chat, or close it when it is already open. */
  openRoutineChat: (key: string) => void;
  /** Draft row click: reopen the setup chat that is still building it. */
  resumeDraft: (key: string) => void;
  /** "New routine": straight to the intake, asking which agent only if needed. */
  startNewRoutine: () => void;
  /** The chat host and the agent picker. Rendered by the section; both add no
   *  layout of their own (the chat portals into the shell panel). */
  node: ReactNode;
}

/**
 * The team Routines section's chat wiring: which agent's chat is open, what it
 * was asked to show, and what it reports back.
 *
 * The section cannot own the selection itself — the chat's machinery is
 * per-agent (see {@link TeamRoutinePanel}) — so this is a REQUEST/REPORT seam
 * rather than a controlled hook: the section names an owner and an intent, the
 * child applies it once through the existing state machine, and the child says
 * what it actually ended up showing. That report is what lights the row (an
 * intake that becomes a draft that becomes a real routine moves the highlight
 * from the draft row to the routine's on its own) and what closes the panel
 * when the chat closes.
 */
export function useTeamRoutineHost({
  scoped,
  teamAgents,
  list,
  drafts,
  accountTimezone,
  triggerSummaries,
}: {
  /** The agents this section is looking at (the whole team, or the pinned one). */
  scoped: Agent[];
  /** Every agent in the team, pin or no pin — what a one-shot notification
   *  target is resolved against, since it names an owner the dropdown may
   *  currently be hiding. */
  teamAgents: Agent[];
  list: TeamRoutinesList;
  drafts: TeamRoutineDraftsList;
  accountTimezone: string;
  triggerSummaries: Record<string, string>;
}): TeamRoutineHost {
  const { t } = useTranslation("teams");
  const [open, setOpen] = useState<OpenChat | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const owner = open
    ? (scoped.find((a) => a.id === open.agentId) ?? null)
    : null;

  // Narrowing the dropdown to another agent (or dragging this one out of the
  // team) must release the panel: the chat's owner is no longer a row anybody
  // can see, so leaving it open would strand a chat with no way back to it.
  useEffect(() => {
    if (open && !scoped.some((a) => a.id === open.agentId)) {
      setOpen(null);
      setSelection(null);
    }
  }, [open, scoped]);

  // A session-finished notification for a routine chat lands here, naming its
  // owner (see `usePendingTeamRoutineChat`). The request is `pending`, not a
  // selection: only the per-agent machinery inside the chat knows whether the
  // id is a routine's chat or an unclaimed draft.
  const openPendingFor = useCallback((agentId: string) => {
    setSelection(null);
    setOpen({ agentId, request: { kind: "pending" } });
  }, []);
  usePendingTeamRoutineChat({ teamAgents, scoped, onOpen: openPendingFor });

  const openIntakeFor = useCallback((agent: Agent) => {
    setSelection(null);
    setOpen({ agentId: agent.id, request: { kind: "intake" } });
  }, []);

  // One agent in scope is not a choice, so it is not a question (the same
  // shortcut the board's empty auto-open makes).
  const startNewRoutine = useCallback(() => {
    if (scoped.length === 1) openIntakeFor(scoped[0]);
    else if (scoped.length > 1) setPickerOpen(true);
  }, [scoped, openIntakeFor]);

  const openRoutineChat = useCallback(
    (key: string) => {
      const agent = list.ownerOf[key];
      const routineId = list.routineIdOf[key];
      if (!agent || !routineId) return;
      setSelection(null);
      setOpen((current) =>
        current?.agentId === agent.id &&
        current.request.kind === "routine" &&
        current.request.routineId === routineId
          ? // Re-clicking the open row closes it, as it does on the tab.
            null
          : { agentId: agent.id, request: { kind: "routine", routineId } },
      );
    },
    [list],
  );

  // A draft row never toggles closed on re-click: unlike a routine, the chat is
  // the only thing the row IS, and the person clicking it again is reaching for
  // the conversation, not dismissing it.
  const resumeDraft = useCallback(
    (key: string) => {
      const agent = drafts.ownerOf[key];
      const activityId = drafts.activityIdOf[key];
      if (!agent || !activityId) return;
      setSelection(null);
      setOpen({ agentId: agent.id, request: { kind: "draft", activityId } });
    },
    [drafts],
  );

  const handleSelectionChange = useCallback((next: Selection | null) => {
    setSelection(next);
    // The chat closed itself (its X, Escape, a failed start): drop the host so
    // the panel claim goes with it.
    if (next === null) setOpen(null);
  }, []);

  return {
    selectedRoutineKey:
      owner && selectionRoutineId(selection)
        ? teamRoutineKey(owner.id, selectionRoutineId(selection) as string)
        : null,
    // `activityId` is null for the beat between the intake completing and the
    // draft chat existing; there is no row to light yet either.
    selectedDraftKey:
      owner && selection?.kind === "draft" && selection.activityId
        ? teamRoutineKey(owner.id, selection.activityId)
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
    node: (
      <>
        {owner && open && (
          <TeamRoutinePanel
            key={owner.id}
            owner={owner}
            request={open.request}
            accountTimezone={accountTimezone}
            triggerSummary={
              selection && "routineId" in selection
                ? triggerSummaries[
                    teamRoutineKey(owner.id, selection.routineId)
                  ]
                : undefined
            }
            onSelectionChange={handleSelectionChange}
          />
        )}
        <AgentPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          agents={scoped}
          onPick={openIntakeFor}
          title={t("teamView.routines.pickAgent.title")}
          description={t("teamView.routines.pickAgent.description")}
        />
      </>
    ),
  };
}
