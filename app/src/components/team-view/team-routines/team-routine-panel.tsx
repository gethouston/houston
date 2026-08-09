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

/** What the section asks this owner's chat to show. */
export type TeamRoutineRequest =
  | { kind: "intake" }
  | { kind: "routine"; routineId: string }
  /** A half-built routine's setup chat, resumed from its draft row. */
  | { kind: "draft"; activityId: string }
  /** Mounted only so the one-shot notification target
   *  (`pendingRoutineChat`) can resolve itself inside this owner's chat: the
   *  id may name a routine's chat OR an unclaimed draft, and only the machinery
   *  in `useRoutinesTabView` knows which, once both reads have landed. */
  | { kind: "pending" };

interface Props {
  /** The agent whose chat this is. The parent mounts one of these, keyed on
   *  this id, so switching owners starts a clean chat instead of carrying the
   *  previous agent's selection across. */
  owner: Agent;
  /** The routine or draft to open (the OWNER-LOCAL id, already decoded), or
   *  the create intake. A new object identity means "apply me". */
  request: TeamRoutineRequest;
  accountTimezone: string;
  triggerSummary?: string;
  /** The live selection inside this chat, reported back so the section can
   *  light the right row and drop the panel when the chat closes. */
  onSelectionChange: (selection: Selection | null) => void;
}

/**
 * ONE agent's routine chat, hosted by the team section.
 *
 * It reuses the per-agent machinery verbatim (`useRoutineChatSetup` +
 * `useRoutinesTabView` + `RoutinesTabPane`) rather than reimplementing it, so
 * the setup interview, the draft→routine handoff and the panel chrome exist
 * exactly once. That machinery is per-agent by nature (its
 * hooks read one agent's activity), which is why the section mounts a CHILD per
 * owner instead of hoisting a controlled hook: hooks may not be called per row.
 *
 * The parent therefore drives it with a REQUEST and reads a REPORT rather than
 * owning the selection. The request is one-way and idempotent (applied once per
 * object identity), so the chat's own transitions — intake completing into a
 * draft, a draft being claimed by the created routine, Escape closing it — stay
 * inside the state machine that already handles them; the report is how the
 * section learns about them.
 */
export function TeamRoutinePanel({
  owner,
  request,
  accountTimezone,
  triggerSummary,
  onSelectionChange,
}: Props) {
  // The SAME per-agent cache key the section's fan-out already warmed, so
  // hosting a chat costs no extra read.
  const { data: routines } = useRoutines(owner.folderPath);
  const { data: allRuns, isLoading: runsLoading } = useQuery(
    routineRunsQueryOptions(owner.folderPath),
  );
  const { capabilities } = useCapabilities();

  const chatSetup = useRoutineChatSetup(owner, routines);
  const nav = useRoutinesTabView(routines, chatSetup, owner.id);
  const { selected } = nav;

  // Apply each request exactly once. `handleOpenChat` is a toggle and its
  // identity changes with every selection, so without this guard a re-render
  // would re-fire the request and close the chat it just opened.
  const applied = useRef<TeamRoutineRequest | null>(null);
  const { openIntake, handleOpenRoutine, handleResumeDraft } = nav;
  useEffect(() => {
    if (applied.current === request) return;
    applied.current = request;
    if (request.kind === "pending") return; // resolved by `nav` itself
    if (request.kind === "intake") openIntake();
    else if (request.kind === "draft") handleResumeDraft(request.activityId);
    else handleOpenRoutine(request.routineId);
  }, [request, openIntake, handleOpenRoutine, handleResumeDraft]);

  // Report the selection, but never the empty frame between mounting and the
  // request landing — the parent reads `null` as "the chat closed", and
  // reporting it early would unmount this child before it ever opened. A
  // `pending` request is the exception: a stale notification id resolves to
  // NOTHING, and the host has to hear that or it keeps an invisible chat open
  // and the list stays squeezed beside a panel nobody can see.
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

  // The chat portals into the ONE shared shell panel (HOU-1165). Only the
  // team view ON SCREEN may claim it: several kept-alive screens are mounted at
  // once, so a hidden team stacking its routine chat over the visible board's
  // mission panel is exactly the defect that guard exists to prevent. There is
  // no tab flag here — a team section is the whole screen — so the screen
  // signal is the only gate.
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
