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
  agents: AgentChip[];
  activeAgentIds: ReadonlySet<string>;
  grantsSupported: boolean;
  canEdit: boolean;
  onToggleAgent: (agentId: string, active: boolean) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  description?: string;
}

/**
 * The global page's per-app detail: status, which agents may use the app (a
 * per-agent Switch when grants are supported and the caller can edit), and the
 * Reconnect / Disconnect actions. When grants are unsupported the host has no
 * per-agent notion, so every agent can use the app (a single note, no toggles).
 */
export function AppDetailSheet({
  open,
  onOpenChange,
  display,
  connection,
  agents,
  activeAgentIds,
  grantsSupported,
  canEdit,
  onToggleAgent,
  onReconnect,
  onDisconnect,
  description,
}: AppDetailSheetProps) {
  const { t } = useTranslation("integrations");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
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
            <p className="mt-3 text-sm text-muted-foreground">
              {description || display.description}
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 py-4">
          <h3 className="mb-2 text-sm font-medium text-foreground">
            {t("detail.activeOn")}
          </h3>
          {!grantsSupported ? (
            <p className="rounded-xl bg-secondary px-3 py-3 text-xs text-muted-foreground">
              {t("detail.allAgentsNote")}
            </p>
          ) : agents.length === 0 ? (
            <p className="rounded-xl bg-secondary px-3 py-3 text-xs text-muted-foreground">
              {t("detail.noAgents")}
            </p>
          ) : (
            <div className="space-y-1">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                >
                  <HoustonAvatar
                    color={resolveAgentColor(agent.color)}
                    diameter={24}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {agent.name}
                  </span>
                  <Switch
                    checked={activeAgentIds.has(agent.id)}
                    disabled={!canEdit}
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

        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onReconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <RotateCw className="size-4" />
            {t("detail.reconnect")}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Unplug className="size-4" />
            {t("detail.disconnect")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
