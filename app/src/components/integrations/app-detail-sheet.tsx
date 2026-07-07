import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AccountSection } from "./account-section";
import type { AgentChip } from "./agent-chip";
import type { AppDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { CustomBadge } from "./custom-badge";
import { McpBadge } from "./mcp-badge";

interface AppDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  display: AppDisplay;
  /** Every connected account of this one app (always at least one). */
  connections: IntegrationConnection[];
  agents: AgentChip[];
  /** Per account (`connectionId`), the agent ids that have it granted. */
  activeAgentIdsByConnection: ReadonlyMap<string, ReadonlySet<string>>;
  grantsSupported: boolean;
  canEdit: boolean;
  onToggleAgent: (
    connectionId: string,
    agentId: string,
    active: boolean,
  ) => void;
  onRename: (connectionId: string, alias: string) => void;
  onReconnect: (connectionId: string) => void;
  onDisconnect: (connectionId: string) => void;
  onAddAccount: (toolkit: string) => void;
  /** A connect flow is running, so "Add another account" is disabled. */
  connectInFlight: boolean;
  description?: string;
  /**
   * A user-managed integration the caller owns end-to-end: a custom API-key
   * integration (`"custom"`) or a remote MCP server (`"mcp"`). Either shows its
   * provider badge, swaps the "Add another account" footer for Edit + Delete,
   * and hides the per-account rename/disconnect (there is one implicit account,
   * managed here). Undefined = a normal OAuth catalog app.
   */
  manageKind?: "custom" | "mcp";
  /** Open the edit form. Required when `manageKind` is set. */
  onEdit?: () => void;
}

/**
 * The per-app detail sheet. One card per app; each connected ACCOUNT of that app
 * renders its own section (label, status, per-agent grant switches, rename,
 * reconnect, disconnect). A footer "Add another account" re-runs the connect
 * flow for this toolkit so a user can link a second login of the same app.
 */
export function AppDetailSheet({
  open,
  onOpenChange,
  display,
  connections,
  agents,
  activeAgentIdsByConnection,
  grantsSupported,
  canEdit,
  onToggleAgent,
  onRename,
  onReconnect,
  onDisconnect,
  onAddAccount,
  connectInFlight,
  description,
  manageKind,
  onEdit,
}: AppDetailSheetProps) {
  const { t } = useTranslation("integrations");
  const managed = manageKind !== undefined;
  const isMcp = manageKind === "mcp";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <div className="flex items-center gap-3">
            <AppLogo display={display} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate">{display.name}</SheetTitle>
                {managed && (isMcp ? <McpBadge /> : <CustomBadge />)}
              </div>
              {!managed && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("account.count", { count: connections.length })}
                </p>
              )}
            </div>
          </div>
          {(description || display.description) && (
            <p className="mt-3 text-sm text-muted-foreground">
              {description || display.description}
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
          <h3 className="text-sm font-medium text-foreground">
            {t("detail.accounts")}
          </h3>
          {connections.map((connection) => (
            <AccountSection
              key={connection.connectionId}
              connection={connection}
              agents={agents}
              grantsSupported={grantsSupported}
              canEdit={canEdit}
              activeAgentIds={
                activeAgentIdsByConnection.get(connection.connectionId) ??
                EMPTY_SET
              }
              onToggleAgent={(agentId, active) =>
                onToggleAgent(connection.connectionId, agentId, active)
              }
              onRename={(alias) => onRename(connection.connectionId, alias)}
              onReconnect={() => onReconnect(connection.connectionId)}
              onDisconnect={() => onDisconnect(connection.connectionId)}
              hideAccountActions={managed}
            />
          ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          {managed ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Pencil className="size-4" />
                {isMcp ? t("mcp.edit") : t("custom.edit")}
              </button>
              <button
                type="button"
                onClick={() =>
                  connections[0] && onDisconnect(connections[0].connectionId)
                }
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                {isMcp ? t("mcp.delete") : t("custom.delete")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={connectInFlight}
              onClick={() => onAddAccount(display.toolkit)}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <Plus className="size-4" />
              {t("account.addAnother")}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();
