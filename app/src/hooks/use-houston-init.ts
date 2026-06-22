import { useEffect, useRef } from "react";
import { tauriPreferences, tauriProvider, tauriRoutines } from "../lib/tauri";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { analytics } from "../lib/analytics";
import { DEFAULT_TAB_ID } from "../agents/standard-tabs";

/**
 * App initialization hook. Called once in App.tsx.
 */
export function useHoustonInit() {
  const initRef = useRef(false);
  const loadConfigs = useAgentCatalogStore((s) => s.loadConfigs);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const setCurrent = useAgentStore((s) => s.setCurrent);
  const setClaudeAvailable = useUIStore((s) => s.setClaudeAvailable);
  const setViewMode = useUIStore((s) => s.setViewMode);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      await loadConfigs();
      await loadWorkspaces();

      const wsState = useWorkspaceStore.getState();
      let currentWorkspace = wsState.current;
      try {
        const lastWsId = await tauriPreferences.get("last_workspace_id");
        if (lastWsId) {
          const saved = wsState.workspaces.find((w) => w.id === lastWsId);
          if (saved) {
            useWorkspaceStore.getState().setCurrent(saved);
            currentWorkspace = saved;
          }
        }
      } catch (e) {
        console.error("[init] Failed to restore last workspace:", e);
      }

      if (currentWorkspace) {
        await loadAgents(currentWorkspace.id);
        // Spin up the routine scheduler for every agent in the workspace so
        // cron jobs fire even if the user never selects the agent.
        const agents = useAgentStore.getState().agents;
        await Promise.all(
          agents.map((a) =>
            tauriRoutines
              .startScheduler(a.folderPath)
              .catch((e) =>
                console.error(`[init] scheduler start failed for ${a.id}:`, e),
              ),
          ),
        );
      }

      try {
        const lastId = await tauriPreferences.get("last_agent_id");
        if (lastId) {
          const agents = useAgentStore.getState().agents;
          const saved = agents.find((a) => a.id === lastId);
          if (saved) {
            setCurrent(saved);
            setViewMode(DEFAULT_TAB_ID);
          }
        }
      } catch (e) {
        console.error("[init] Failed to restore last agent:", e);
      }

      // Check if the default provider's CLI is available
      try {
        const defaultProv = await tauriProvider.getDefault();
        if (defaultProv) {
          const status = await tauriProvider.checkStatus(defaultProv);
          setClaudeAvailable(status.cli_installed && status.authenticated);
        } else {
          // No provider configured — track as activation drop-off signal
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
    setCurrent,
    setClaudeAvailable,
    setViewMode,
  ]);
}
