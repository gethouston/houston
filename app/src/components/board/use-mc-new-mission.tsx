import type { NewPanelOpener } from "@houston-ai/board";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "../../lib/types";
import { newTaskHeldBySeed } from "../../stores/drafts";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { useIsActiveView } from "../shell/keep-alive-views";
import { newMissionTarget } from "./new-mission-target";

export function useMcNewMission({
  agents,
  visibleAgents,
  scopedAgents,
  pinnedAgent,
  selectedId,
  setSelectedId,
}: {
  agents: Agent[];
  visibleAgents: Agent[];
  scopedAgents: Agent[];
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
  const requestNewMission = useCallback(
    (open: boolean) => {
      if (!open) {
        setMenuOpen(false);
        return;
      }
      if (newTaskHeldBySeed()) return;
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
  useEffect(() => {
    if (!isActive) return;
    setOnStartMission(openNewMission);
    return () => setOnStartMission(null);
  }, [isActive, openNewMission, setOnStartMission]);

  const openComposer = useCallback(
    (agent: Agent, options?: { focusComposer?: boolean }) => {
      setPendingAgent(agent);
      setSelectedId(null);
      openerRef.current?.({ focusComposer: options?.focusComposer ?? true });
    },
    [setSelectedId],
  );
  const handlePickAgent = useCallback(
    (agent: Agent, options?: { focusComposer?: boolean }) => {
      if (newTaskHeldBySeed()) return;
      openComposer(agent, options);
    },
    [openComposer],
  );
  handlePickAgentRef.current = handlePickAgent;
  const newTaskRequest = useUIStore((s) => s.newTaskRequest);
  useEffect(() => {
    if (!isActive || !openerReady || newTaskRequest === null) return;
    const agent = scopedAgents.find((a) => a.id === newTaskRequest);
    if (agent === undefined) return;
    useUIStore.getState().requestNewTask(null);
    openComposer(agent, { focusComposer: false });
  }, [isActive, openerReady, newTaskRequest, scopedAgents, openComposer]);
  const registerOpener = useCallback((opener: NewPanelOpener) => {
    openerRef.current = opener;
    setOpenerReady(true);
  }, []);
  const onAutoOpenEmpty = useCallback(() => {
    if (useUIStore.getState().activeLessonId !== null) return;
    if (visibleAgents.length === 1)
      handlePickAgent(visibleAgents[0], { focusComposer: false });
    else if (visibleAgents.length > 1) setAgentPickerOpen(true);
  }, [visibleAgents, handlePickAgent]);
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
