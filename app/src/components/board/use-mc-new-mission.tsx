import { useCallback, useEffect, useRef, useState } from "react";
import type { NewPanelOpener } from "@houston-ai/board";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import type { Agent } from "../../lib/types";

/**
 * Mission Control's "New mission" flow. Because the view is cross-agent, the
 * button first asks "which agent?" via {@link AgentPickerDialog}; picking one
 * scopes the right panel to that agent (`pendingAgent`) and opens the empty
 * composer. The pending agent clears when the panel closes unselected.
 */
export function useMcNewMission({
  agents,
  visibleAgents,
  selectedId,
  setSelectedId,
}: {
  agents: Agent[];
  /** Agents in scope of the current filter (drives the empty auto-open). */
  visibleAgents: Agent[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const setOnStartMission = useUIStore((s) => s.setOnStartMission);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(null);
  const [openerReady, setOpenerReady] = useState(false);
  const openerRef = useRef<NewPanelOpener | null>(null);

  const openNewMission = useCallback(() => setAgentPickerOpen(true), []);
  useEffect(() => {
    setOnStartMission(openNewMission);
    return () => setOnStartMission(null);
  }, [openNewMission, setOnStartMission]);

  const handlePickAgent = useCallback(
    (agent: Agent, options?: { focusComposer?: boolean }) => {
      setPendingAgent(agent);
      setSelectedId(null);
      openerRef.current?.({ focusComposer: options?.focusComposer ?? true });
    },
    [setSelectedId],
  );
  const registerOpener = useCallback((opener: NewPanelOpener) => {
    openerRef.current = opener;
    setOpenerReady(true);
  }, []);
  const onAutoOpenEmpty = useCallback(() => {
    if (visibleAgents.length === 1) handlePickAgent(visibleAgents[0], { focusComposer: false });
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
    registerOpener,
    openerReady,
    onAutoOpenEmpty,
    agentPickerOpen,
    dialogs,
  };
}
