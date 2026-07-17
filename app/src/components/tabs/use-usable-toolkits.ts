import type { TriggerApp } from "@houston-ai/routines";
import { useMemo } from "react";
import {
  effectiveAllowlist,
  useAgentSettings,
} from "../../hooks/queries/use-agent-settings";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries/use-integrations";
import { useCapabilities } from "../../hooks/use-capabilities";
import { appDisplay } from "../integrations/app-display";
import {
  INTEGRATION_PROVIDER,
  integrationsSupported,
} from "../integrations/model";

/**
 * The apps THIS agent can build an event trigger on (C9): the user's active
 * connections, narrowed to the agent's effective allowlist on a Teams host
 * (single-player has no ceiling → every connected app is usable). "Usable" means
 * exactly what it means on the Integrations tab now — connection ∩ effective
 * allowlist (the per-agent grants layer is gone). Returns the shape
 * `@houston-ai/routines`' TriggerPicker takes, with an account per connection so
 * a multi-account app can be pinned.
 */
export function useUsableToolkits(agentId: string): {
  apps: TriggerApp[];
  loading: boolean;
} {
  const { capabilities } = useCapabilities();
  const enabled = integrationsSupported(capabilities);
  const teams = capabilities?.teams === true;

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, enabled);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, enabled);
  const settingsQuery = useAgentSettings(agentId, enabled && teams);
  // `null` = unrestricted (single-player, or Teams with no ceiling) → every
  // connected app is usable.
  const allowlist = settingsQuery.data
    ? effectiveAllowlist(settingsQuery.data)
    : null;

  const apps = useMemo<TriggerApp[]>(() => {
    const bySlug = new Map((catalog.data ?? []).map((tk) => [tk.slug, tk]));
    const allowed = allowlist ? new Set(allowlist) : null;

    // One entry per toolkit, gathering its active connections as accounts.
    const byToolkit = new Map<string, TriggerApp>();
    for (const conn of connections.data ?? []) {
      if (conn.status !== "active") continue;
      if (allowed && !allowed.has(conn.toolkit)) continue;
      const display = appDisplay(conn.toolkit, bySlug.get(conn.toolkit));
      const existing = byToolkit.get(conn.toolkit);
      const account = {
        id: conn.connectionId,
        label: `${display.name} · ${conn.connectionId.slice(-6)}`,
      };
      if (existing) existing.accounts.push(account);
      else {
        byToolkit.set(conn.toolkit, {
          toolkit: conn.toolkit,
          name: display.name,
          logoUrl: display.logoUrl,
          accounts: [account],
        });
      }
    }
    return [...byToolkit.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [connections.data, catalog.data, allowlist]);

  return {
    apps,
    loading:
      enabled &&
      (connections.isLoading ||
        catalog.isLoading ||
        (teams && settingsQuery.isLoading)),
  };
}
