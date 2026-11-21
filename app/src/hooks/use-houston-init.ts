import { useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import { readBootPreference } from "../lib/boot-preference";
import { providerNotConfirmedDisconnected } from "../lib/provider-connection";
import { tauriProvider } from "../lib/tauri";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";

export function useHoustonInit() {
  const initRef = useRef(false);
  const loadConfigs = useAgentCatalogStore((s) => s.loadConfigs);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const settleAgentsEmpty = useAgentStore((s) => s.settleEmpty);
  const setCurrent = useAgentStore((s) => s.setCurrent);
  const setClaudeAvailable = useUIStore((s) => s.setClaudeAvailable);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      await loadConfigs();
      await loadWorkspaces();

      const currentWorkspace = useWorkspaceStore.getState().current;

      const lastAgentId = await readBootPreference("last_agent_id");

      if (currentWorkspace) {
        await loadAgents(currentWorkspace.id);
      } else {
        settleAgentsEmpty();
      }

      if (lastAgentId) {
        const agents = useAgentStore.getState().agents;
        const saved = agents.find((a) => a.id === lastAgentId);
        if (saved) setCurrent(saved);
      }

      try {
        const defaultProv = await tauriProvider.getDefault();
        if (defaultProv) {
          const status = await tauriProvider.checkStatus(defaultProv);
          setClaudeAvailable(providerNotConfirmedDisconnected(status));
        } else {
          analytics.track("provider_not_configured");
          setClaudeAvailable(false);
        }
      } catch {
        setClaudeAvailable(false);
      }
    }

    init();
  }, [
    loadConfigs,
    loadWorkspaces,
    loadAgents,
    settleAgentsEmpty,
    setCurrent,
    setClaudeAvailable,
  ]);
}
