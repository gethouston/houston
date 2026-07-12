import {
  HoustonAvatar,
  resolveAgentColor,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { RotateCw, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentChip } from "./agent-chip";
import type { AppDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { ConnectionStatusBadge } from "./connection-status-badge";

interface AppDetailSheetProps {
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
 * The per-app detail sheet: status, an optional "which agents may use the app"
 * block, and the Reconnect / Disconnect actions. The per-agent block renders
 * ONLY when `onToggleAgent` is passed (a per-agent Switch when grants are
 * supported, each row disabled unless that agent is in `editableAgentIds`; when
 * grants are unsupported the host has no per-agent notion, so a single "every
 * agent can use it" note). Settings passes the toggles; the global page omits
 * `onToggleAgent`, so the sheet shows only the header + description + the
 * reconnect/disconnect footer.
 */
export function AppDetailSheet({
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
}: AppDetailSheetProps) {
  const { t } = useTranslation("integrations");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-line">
          <div className="flex items-center gap-3">
            <AppLogo display={display} size="lg" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{display.name}</SheetTitle>
              <div className="mt-1">
                <ConnectionStatusBadge status={connection.status} />
              </div>
            </div>
          </div>
          {(description || display.description) && (
            <p className="mt-3 text-sm text-ink-muted">
              {description || display.description}
            </p>
          )}
        </SheetHeader>

        {onToggleAgent && (
          <div className="flex-1 overflow-auto px-4 py-4">
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

        <div className="flex gap-2 border-t border-line px-4 py-3">
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
      </SheetContent>
    </Sheet>
  );
}
