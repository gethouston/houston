import { useEffect, useRef } from "react";
import { DEFAULT_TAB_ID } from "../agents/standard-tabs";
import { analytics } from "../lib/analytics";
import { tauriPreferences, tauriProvider, tauriRoutines } from "../lib/tauri";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";

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

      // Read BEFORE loadAgents: its auto-selection of agents[0] runs the
      // same side effects a user selection does, which OVERWRITE this
      // preference — reading it afterwards always restored agents[0]
      // (surfaced by HOU-693's relaunch-mid-warm-up flow, but generic).
      let lastAgentId: string | null = null;
      try {
        lastAgentId = await tauriPreferences.get("last_agent_id");
      } catch (e) {
        console.error("[init] Failed to read last agent:", e);
      }

      if (currentWorkspace) {
        await loadAgents(currentWorkspace.id);
        // Spin up the routine scheduler for every agent in the workspace so
        // cron jobs fire even if the user never selects the agent. NOT
        // awaited: these are per-agent calls, and against a cold/warming
        // engine each one is held until that engine wakes — blocking here
        // stalled the last-agent restore below for the whole warm-up
        // (HOU-693), leaving the wrong agent selected after a relaunch.
        const agents = useAgentStore.getState().agents;
        void Promise.all(
          agents.map((a) =>
            tauriRoutines
              .startScheduler(a.folderPath)
              .catch((e) =>
                console.error(`[init] scheduler start failed for ${a.id}:`, e),
              ),
          ),
        );
      }

      if (lastAgentId) {
        const agents = useAgentStore.getState().agents;
        const saved = agents.find((a) => a.id === lastAgentId);
        if (saved) {
          setCurrent(saved);
          setViewMode(DEFAULT_TAB_ID);
        }
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
