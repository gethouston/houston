import type { NewPanelOpener } from "@houston-ai/board";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { useIsActiveView } from "../shell/keep-alive-views";
import { newMissionTarget } from "./new-mission-target";

/**
 * A board's "New task" flow.
 *
 * The board is cross-agent, so the act needs an owner — but it only ASKS when
 * there is a real choice (`newMissionTarget`). A board pinned to one agent, or
 * a team holding one, opens that agent's composer straight away; anything else
 * opens a MENU hung off the button. The modal picker no longer serves this
 * path at all: it stopped the world for a three-item choice and covered the
 * rail the user was reading those names from.
 *
 * {@link AgentPickerDialog} survives for the other path — an EMPTY board
 * auto-opening its composer, where there is no button to hang a menu on.
 *
 * Picking scopes the right panel to that agent (`pendingAgent`) and opens the
 * empty composer; the pending agent clears when the panel closes unselected.
 */
export function useMcNewMission({
  agents,
  visibleAgents,
  scopedAgents,
  pinnedAgent,
  selectedId,
  setSelectedId,
}: {
  agents: Agent[];
  /** Agents in scope of the current filter (drives the empty auto-open). */
  visibleAgents: Agent[];
  /** The board's own agents — the menu's roster. */
  scopedAgents: Agent[];
  /** The agent the board is narrowed to, if any. */
  pinnedAgent: Agent | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const setOnStartMission = useUIStore((s) => s.setOnStartMission);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const isActive = useIsActiveView();

  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(null);
  const [openerReady, setOpenerReady] = useState(false);
  const openerRef = useRef<NewPanelOpener | null>(null);

  const handlePickAgentRef = useRef<
    (agent: Agent, options?: { focusComposer?: boolean }) => void
  >(() => {});
  /**
   * The button's whole behaviour, and the keyboard shortcut's: a request to
   * OPEN the menu that answers itself directly when there is nothing to ask.
   * Radix drives this from the trigger's own click, so a direct target never
   * opens a menu for a frame before closing it.
   */
  const requestNewMission = useCallback(
    (open: boolean) => {
      if (!open) {
        setMenuOpen(false);
        return;
      }
      const target = newMissionTarget(pinnedAgent, scopedAgents);
      if (target.kind === "direct") {
        handlePickAgentRef.current(target.agent);
        return;
      }
      setMenuOpen(true);
    },
    [pinnedAgent, scopedAgents],
  );
  const openNewMission = useCallback(
    () => requestNewMission(true),
    [requestNewMission],
  );
  // Only the board ON SCREEN owns the global "New mission" handler. Mission
  // Control and every team board are kept-alive screens, so several of them are
  // mounted at once: an unconditional registration is last-writer-wins, and the
  // shortcut would open a hidden team's agent picker while the user is looking
  // at the global board.
  useEffect(() => {
    if (!isActive) return;
    setOnStartMission(openNewMission);
    return () => setOnStartMission(null);
  }, [isActive, openNewMission, setOnStartMission]);

  const handlePickAgent = useCallback(
    (agent: Agent, options?: { focusComposer?: boolean }) => {
      setPendingAgent(agent);
      setSelectedId(null);
      openerRef.current?.({ focusComposer: options?.focusComposer ?? true });
    },
    [setSelectedId],
  );
  handlePickAgentRef.current = handlePickAgent;
  const registerOpener = useCallback((opener: NewPanelOpener) => {
    openerRef.current = opener;
    setOpenerReady(true);
  }, []);
  const onAutoOpenEmpty = useCallback(() => {
    // The in-app onboarding teaches the New task CLICK; an empty board
    // auto-opening the composer would perform the lesson's step by itself
    // (and read as "a task started on its own").
    if (useUIStore.getState().inAppOnboardingActive) return;
    if (visibleAgents.length === 1)
      handlePickAgent(visibleAgents[0], { focusComposer: false });
    else if (visibleAgents.length > 1) setAgentPickerOpen(true);
  }, [visibleAgents, handlePickAgent]);
  // Reset the pending agent when the panel closes without a card selected, so
  // the next panel open doesn't scope to a stale agent.
  useEffect(() => {
    if (!missionPanelOpen && !selectedId) setPendingAgent(null);
  }, [missionPanelOpen, selectedId]);

  const dialogs = (
    <AgentPickerDialog
      open={agentPickerOpen}
      onOpenChange={setAgentPickerOpen}
      agents={agents}
      onPick={handlePickAgent}
    />
  );

  return {
    pendingAgent,
    openNewMission,
    /** The board's agents, for the button's own menu. */
    newMissionAgents: scopedAgents,
    menuOpen,
    requestNewMission,
    pickNewMissionAgent: handlePickAgent,
    registerOpener,
    openerReady,
    onAutoOpenEmpty,
    agentPickerOpen,
    dialogs,
  };
}
