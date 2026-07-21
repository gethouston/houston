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

/** A not-yet-connected app the agent is allowed to build a trigger on. Offered
 *  in the chat-first stepper's app grid so the user can connect it inline, then
 *  pick an event on it, without leaving the flow. */
export interface ConnectableApp {
  toolkit: string;
  name: string;
  logoUrl?: string;
}

export interface UsableToolkits {
  /** Apps with an ACTIVE connection the agent may use (connection ∩ allowlist). */
  apps: TriggerApp[];
  /** Allowed apps the agent has NOT connected yet (catalog ∩ allowlist − connected).
   *  Empty unless the caller opts in via `{ connectable: true }`. On an
   *  unrestricted host this is the whole catalog, so the grid gates it behind a
   *  search field rather than rendering every row. */
  connectable: ConnectableApp[];
  loading: boolean;
}

/**
 * The apps THIS agent can build an event trigger on (C9): the user's active
 * connections, narrowed to the agent's effective allowlist on a Teams host
 * (single-player has no ceiling → every connected app is usable). "Usable" means
 * exactly what it means on the Integrations tab now — connection ∩ effective
 * allowlist (the per-agent grants layer is gone). Returns the shape
 * `@houston-ai/routines`' TriggerPicker takes, with an account per connection so
 * a multi-account app can be pinned.
 *
 * With `{ connectable: true }` it ALSO returns the allowed-but-unconnected apps,
 * so the chat-first stepper can offer an inline "connect a new app" path — the
 * agent's allowlist ∩ the integrations catalog, minus what is already connected.
 */
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
  // `null` = unrestricted (single-player, or Teams with no ceiling) → every
  // connected app is usable. The agent's own ceiling is the whole allowlist.
  const allowlist = settingsQuery.data?.allowedToolkits ?? null;

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
