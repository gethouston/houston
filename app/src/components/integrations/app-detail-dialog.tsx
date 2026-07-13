import {
  CatalogDetailDialog,
  HoustonAvatar,
  resolveAgentColor,
  Switch,
} from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { RotateCw, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentChip } from "./agent-chip";
import type { AppDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { ConnectionStatusBadge } from "./connection-status-badge";

interface AppDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  display: AppDisplay;
  connection: IntegrationConnection;
  agents?: AgentChip[];
  activeAgentIds?: ReadonlySet<string>;
  grantsSupported?: boolean;
  /** The agents whose grant the caller may edit (`canEditAgentGrants` holds).
   * Per-agent because that right varies per agent in multiplayer; an agent not
   * in the set renders a disabled Switch. */
  editableAgentIds?: ReadonlySet<string>;
  onToggleAgent?: (agentId: string, active: boolean) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  description?: string;
}

/**
 * The per-app detail MODAL for a connected app — the same {@link
 * CatalogDetailDialog} the browse rows open (one detail surface per catalog
 * family, never a slideover): status chip beside the art, the full
 * description, an optional "which agents may use the app" block, and the
 * Reconnect / Disconnect actions. The per-agent block renders ONLY when
 * `onToggleAgent` is passed (a per-agent Switch when grants are supported,
 * each row disabled unless that agent is in `editableAgentIds`; when grants
 * are unsupported the host has no per-agent notion, so a single "every agent
 * can use it" note). Settings passes the toggles; the global page omits
 * `onToggleAgent`, so the dialog shows only header + description + footer.
 */
export function AppDetailDialog({
  open,
  onOpenChange,
  display,
  connection,
  agents,
  activeAgentIds,
  grantsSupported,
  editableAgentIds,
  onToggleAgent,
  onReconnect,
  onDisconnect,
  description,
}: AppDetailDialogProps) {
  const { t } = useTranslation("integrations");
  return (
    <CatalogDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<AppLogo display={display} size="xl" className="rounded-xl" />}
      title={display.name}
      tags={<ConnectionStatusBadge status={connection.status} />}
      description={description || display.description}
      action={
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onReconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-input px-3 text-sm font-medium text-ink transition-colors hover:bg-chip"
          >
            <RotateCw className="size-4" />
            {t("detail.reconnect")}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <Unplug className="size-4" />
            {t("detail.disconnect")}
          </button>
        </div>
      }
    >
      {onToggleAgent && (
        <div className="max-h-72 overflow-auto">
          <h3 className="mb-2 text-sm font-medium text-ink">
            {t("detail.activeOn")}
          </h3>
          {!grantsSupported ? (
            <p className="rounded-xl bg-chip px-3 py-3 text-xs text-ink-muted">
              {t("detail.allAgentsNote")}
            </p>
          ) : (agents ?? []).length === 0 ? (
            <p className="rounded-xl bg-chip px-3 py-3 text-xs text-ink-muted">
              {t("detail.noAgents")}
            </p>
          ) : (
            <div className="space-y-1">
              {(agents ?? []).map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                >
                  <HoustonAvatar
                    color={resolveAgentColor(agent.color)}
                    diameter={24}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {agent.name}
                  </span>
                  <Switch
                    checked={(activeAgentIds ?? new Set()).has(agent.id)}
                    disabled={!editableAgentIds?.has(agent.id)}
                    aria-label={agent.name}
                    onCheckedChange={(active) =>
                      onToggleAgent(agent.id, active)
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CatalogDetailDialog>
  );
}
