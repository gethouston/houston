import { useEffect, useRef } from "react";
import { useRoutines } from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import type { Agent } from "../../../lib/types";
import { useAgentCatalogStore } from "../../../stores/agent-catalog";
import { useIsActiveView } from "../../shell/keep-alive-views";
import { useShellDetailPanel } from "../../shell/use-shell-detail-panel";
import type { Selection } from "../../tabs/routines-tab-model";
import { RoutinesTabPane } from "../../tabs/routines-tab-pane";
import { useRoutineChatSetup } from "../../tabs/use-routine-chat-setup";
import { useRoutinesTabView } from "../../tabs/use-routines-tab-view";

/** What the section asks this owner's chat to show. */
export type TeamRoutineRequest =
  | { kind: "intake" }
  | { kind: "routine"; routineId: string }
  /** A half-built routine's setup chat, resumed from its draft row. */
  | { kind: "draft"; activityId: string };

interface Props {
  /** The agent whose chat this is. The parent mounts one of these, keyed on
   *  this id, so switching owners starts a clean chat instead of carrying the
   *  previous agent's selection across. */
  owner: Agent;
  /** The routine or draft to open (the OWNER-LOCAL id, already decoded), or
   *  the create intake. A new object identity means "apply me". */
  request: TeamRoutineRequest;
  accountTimezone: string;
  /** The live selection inside this chat, reported back so the section can
   *  light the right row and drop the panel when the chat closes. */
  onSelectionChange: (selection: Selection | null) => void;
}

/**
 * ONE agent's routine chat, hosted by the team section.
 *
 * It reuses the per-agent machinery verbatim (`useRoutineChatSetup` +
 * `useRoutinesTabView` + `RoutinesTabPane`) rather than reimplementing it, so
 * the setup interview, the draft→routine handoff and the panel chrome are the
 * same code the Routines tab runs. That machinery is per-agent by nature (its
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
  onSelectionChange,
}: Props) {
  // The SAME per-agent cache key the section's fan-out already warmed, so
  // hosting a chat costs no extra read.
  const { data: routines } = useRoutines(owner.folderPath);
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const agentDef = getAgentDef(owner.configId);
  const { capabilities } = useCapabilities();

  const chatSetup = useRoutineChatSetup(owner, routines);
  const nav = useRoutinesTabView(routines, chatSetup);
  const { selected } = nav;

  // Apply each request exactly once. `handleOpenChat` is a toggle and its
  // identity changes with every selection, so without this guard a re-render
  // would re-fire the request and close the chat it just opened.
  const applied = useRef<TeamRoutineRequest | null>(null);
  const { openIntake, handleOpenChat, handleResumeDraft } = nav;
  useEffect(() => {
    if (applied.current === request) return;
    applied.current = request;
    if (request.kind === "intake") openIntake();
    else if (request.kind === "draft") handleResumeDraft(request.activityId);
    else handleOpenChat(request.routineId);
  }, [request, openIntake, handleOpenChat, handleResumeDraft]);

  // Report the selection, but never the empty frame between mounting and the
  // request landing — the parent reads `null` as "the chat closed", and
  // reporting it early would unmount this child before it ever opened.
  const reported = useRef(false);
  useEffect(() => {
    if (selected) reported.current = true;
    else if (!reported.current) return;
    onSelectionChange(selected);
  }, [selected, onSelectionChange]);

  // The chat portals into the ONE shared shell panel (HOU-1165). Only the
  // team view ON SCREEN may claim it: several kept-alive screens are mounted at
  // once, so a hidden team stacking its routine chat over the visible board's
  // mission panel is exactly the defect that guard exists to prevent. There is
  // no tab flag here — a team section is the whole screen — so the screen
  // signal is the only gate.
  const screenActive = useIsActiveView();
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  const portalContainer = screenActive ? panelContainer : null;
  const claimable = screenActive && !!selected && !!agentDef;
  useEffect(() => {
    setPanelOpen(claimable);
  }, [claimable, setPanelOpen]);

  if (!selected || !agentDef) return null;

  return (
    <RoutinesTabPane
      selected={selected}
      agent={owner}
      agentDef={agentDef}
      routines={routines}
      chatSetup={chatSetup}
      accountTimezone={accountTimezone}
      triggersAvailable={!!capabilities?.triggers}
      panelContainer={portalContainer}
      onIntakeComplete={nav.handleIntakeComplete}
      onIntakeDismiss={nav.dismissIntake}
      onIntakeSend={nav.handleIntakeComposerSend}
      onDeselect={nav.deselect}
    />
  );
}
