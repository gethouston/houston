import type { NewPanelOpener } from "@houston-ai/board";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentDefinition } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

/**
 * The per-agent "New mission" flow: a default-mode opener (registered as the
 * tab bar's New Mission button) plus extra buttons for the agent's additional
 * modes. Owns the pending agent mode so the create path knows which prompt
 * profile to run, and clears it when the panel closes unselected.
 */
export function useAgentNewMission({
  agentDef,
  selectedId,
}: {
  agentDef: AgentDefinition;
  selectedId: string | null;
}) {
  const setOnStartMission = useUIStore((s) => s.setOnStartMission);
  const setBoardActions = useUIStore((s) => s.setBoardActions);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const agentModes = agentDef.config.agents;

  const [pendingAgentMode, setPendingAgentMode] = useState<string | null>(null);
  const [openerReady, setOpenerReady] = useState(false);
  const openerRef = useRef<NewPanelOpener | null>(null);

  const openDefaultMission = useCallback(() => {
    if (agentModes?.length) setPendingAgentMode(agentModes[0].id);
    openerRef.current?.({ focusComposer: true });
  }, [agentModes]);

  const registerOpener = useCallback(
    (opener: NewPanelOpener) => {
      openerRef.current = opener;
      setOpenerReady(true);
      // Default New Mission button — always registered.
      setOnStartMission(openDefaultMission);
      // Extra board buttons for additional agent modes (skip the first — it's
      // the default New Mission button).
      if (agentModes && agentModes.length > 1) {
        setBoardActions(
          agentModes.slice(1).map((mode) => ({
            id: mode.id,
            label: mode.createLabel,
            onClick: () => {
              setPendingAgentMode(mode.id);
              opener({ focusComposer: true });
            },
          })),
        );
      }
    },
    [setOnStartMission, setBoardActions, agentModes, openDefaultMission],
  );

  const onAutoOpenEmpty = useCallback(() => {
    if (agentModes?.length) setPendingAgentMode(agentModes[0].id);
    openerRef.current?.();
  }, [agentModes]);

  useEffect(
    () => () => {
      setOnStartMission(null);
      setBoardActions([]);
    },
    [setOnStartMission, setBoardActions],
  );
  // Reset the pending mode when the panel closes without a selection so the
  // next new-mission panel doesn't inherit the previous mode.
  useEffect(() => {
    if (!missionPanelOpen && !selectedId) setPendingAgentMode(null);
  }, [missionPanelOpen, selectedId]);

  return {
    pendingAgentMode,
    setPendingAgentMode,
    openerReady,
    openDefaultMission,
    registerOpener,
    onAutoOpenEmpty,
  };
}
