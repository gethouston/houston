import { useEffect, useState } from "react";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav";
import { useAgentSettingsNav } from "../team-view/agent-settings-nav-store";

export function useAgentMissionsSettings(agentId: string) {
  const requestedAgentId = useAgentSettingsNav(
    (store) => store.requestedAgentId,
  );
  const requestedSection = useAgentSettingsNav(
    (store) => store.requestedSection,
  );
  const clearRequested = useAgentSettingsNav((store) => store.clearRequested);
  const [open, setOpen] = useState(requestedAgentId === agentId);
  const [section, setSection] = useState<AgentSettingsSection | undefined>(
    requestedAgentId === agentId ? (requestedSection ?? undefined) : undefined,
  );
  useEffect(() => {
    if (requestedAgentId !== agentId) return;
    setSection(requestedSection ?? undefined);
    setOpen(true);
    clearRequested();
  }, [agentId, clearRequested, requestedAgentId, requestedSection]);
  return {
    open,
    section,
    openIndex: () => {
      setSection(undefined);
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}
