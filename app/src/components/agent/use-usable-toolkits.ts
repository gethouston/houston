import type { TriggerApp } from "@houston-ai/routines";
import { useMemo } from "react";
import { useAgentSettings } from "../../hooks/queries/use-agent-settings";
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

export interface ConnectableApp {
  toolkit: string;
  name: string;
  logoUrl?: string;
}

export interface UsableToolkits {
  apps: TriggerApp[];
  connectable: ConnectableApp[];
  loading: boolean;
}

export function useUsableToolkits(
  agentId: string,
  opts?: { connectable?: boolean },
): UsableToolkits {
  const wantConnectable = opts?.connectable === true;
  const { capabilities } = useCapabilities();
  const enabled = integrationsSupported(capabilities);
  const teams = capabilities?.teams === true;

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, enabled);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, enabled);
  const settingsQuery = useAgentSettings(agentId, enabled && teams);
  const allowlist = settingsQuery.data?.allowedToolkits ?? null;

  const apps = useMemo<TriggerApp[]>(() => {
    const bySlug = new Map((catalog.data ?? []).map((tk) => [tk.slug, tk]));
    const allowed = allowlist ? new Set(allowlist) : null;

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

  const connectable = useMemo<ConnectableApp[]>(() => {
    if (!wantConnectable) return [];
    const allowed = allowlist ? new Set(allowlist) : null;
    const connected = new Set(apps.map((a) => a.toolkit));
    const out: ConnectableApp[] = [];
    for (const tk of catalog.data ?? []) {
      if (connected.has(tk.slug)) continue;
      if (allowed && !allowed.has(tk.slug)) continue;
      const display = appDisplay(tk.slug, tk);
      out.push({
        toolkit: tk.slug,
        name: display.name,
        logoUrl: display.logoUrl,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [wantConnectable, catalog.data, allowlist, apps]);

  return {
    apps,
    connectable,
    loading:
      enabled &&
      (connections.isLoading ||
        catalog.isLoading ||
        (teams && settingsQuery.isLoading)),
  };
}
