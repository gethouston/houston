import { useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import { readBootPreference } from "../lib/boot-preference";
import { providerNotConfirmedDisconnected } from "../lib/provider-connection";
import { tauriProvider } from "../lib/tauri";
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
  const settleAgentsEmpty = useAgentStore((s) => s.settleEmpty);
  const setCurrent = useAgentStore((s) => s.setCurrent);
  const setClaudeAvailable = useUIStore((s) => s.setClaudeAvailable);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      await loadConfigs();
      await loadWorkspaces();

      const wsState = useWorkspaceStore.getState();
      let currentWorkspace = wsState.current;
      // Both restores read through `readBootPreference`: a device store that
      // refuses the read answers "unset" and is reported, so boot continues into
      // the resolved space with its agents instead of stopping on a convenience.
      const lastWsId = await readBootPreference("last_workspace_id");
      if (lastWsId) {
        const saved = wsState.workspaces.find((w) => w.id === lastWsId);
        if (saved) {
          useWorkspaceStore.getState().setCurrent(saved);
          currentWorkspace = saved;
        }
      }

      // Read BEFORE loadAgents: its auto-selection of agents[0] runs the
      // same side effects a user selection does, which OVERWRITE this
      // preference — reading it afterwards always restored agents[0]
      // (surfaced by HOU-693's relaunch-mid-warm-up flow, but generic).
      const lastAgentId = await readBootPreference("last_agent_id");

      if (currentWorkspace) {
        await loadAgents(currentWorkspace.id);
      } else {
        // No space resolved, so `loadAgents` never runs. Settle the store
        // instead of leaving `loaded` false forever: the boot splash and the
        // provider probe both gate on it, and a load that can never arrive is
        // an infinite spinner, not a wait. The failure itself is already
        // surfaced (the workspace call toasts + reports, and the store's
        // `loadError` drives the Settings retry).
        settleAgentsEmpty();
      }

      if (lastAgentId) {
        const agents = useAgentStore.getState().agents;
        const saved = agents.find((a) => a.id === lastAgentId);
        // Restoring the last agent makes it CURRENT for provider routing and
        // preferences. The desktop landing follows sidebar order separately.
        if (saved) setCurrent(saved);
      }

      // Check if the default provider's CLI is available
      try {
        const defaultProv = await tauriProvider.getDefault();
        if (defaultProv) {
          const status = await tauriProvider.checkStatus(defaultProv);
          // The PERMISSIVE read (not confirmed-connected): an "unknown" probe
          // against a still-waking pod must not degrade first-load gating for
          // a provider that is in fact connected server-side. This gate never
          // paints a "Connected" badge, so leniency here is safe.
          setClaudeAvailable(providerNotConfirmedDisconnected(status));
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
    settleAgentsEmpty,
    setCurrent,
    setClaudeAvailable,
  ]);
}
