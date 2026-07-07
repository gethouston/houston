import { HoustonAvatar, resolveAgentColor, Switch } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { Check, Pencil, RotateCw, Unplug, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentChip } from "./agent-chip";
import { ConnectionStatusBadge } from "./connection-status-badge";
import { accountDisplayLabel } from "./model";

interface AccountSectionProps {
  connection: IntegrationConnection;
  agents: AgentChip[];
  grantsSupported: boolean;
  canEdit: boolean;
  /** Agent ids that currently have THIS account granted. */
  activeAgentIds: ReadonlySet<string>;
  onToggleAgent: (agentId: string, active: boolean) => void;
  onRename: (alias: string) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

/**
 * One connected account within an app's detail sheet: its label (with an inline
 * rename affordance), live status, the per-agent grant switches for THIS
 * account, and the account-scoped Reconnect (pending/error only) + Disconnect
 * actions. A single app may have several of these stacked in the sheet.
 */
export function AccountSection({
  connection,
  agents,
  grantsSupported,
  canEdit,
  activeAgentIds,
  onToggleAgent,
  onRename,
  onReconnect,
  onDisconnect,
}: AccountSectionProps) {
  const { t } = useTranslation("integrations");
  const [editing, setEditing] = useState(false);
  const label = accountDisplayLabel(connection, t("account.unnamed"));
  const needsReconnect =
    connection.status === "pending" || connection.status === "error";

  return (
    <section className="rounded-xl border border-border">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        {editing ? (
          <RenameField
            initial={connection.accountLabel ?? ""}
            onSave={(alias) => {
              onRename(alias);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {label}
              </p>
              <div className="mt-0.5">
                <ConnectionStatusBadge status={connection.status} />
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={t("account.rename")}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                <Pencil className="size-3.5" />
                {t("account.rename")}
              </button>
            )}
          </>
        )}
      </header>

      <div className="px-3 py-2.5">
        {!grantsSupported ? (
          <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {t("detail.allAgentsNote")}
          </p>
        ) : agents.length === 0 ? (
          <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {t("detail.noAgents")}
          </p>
        ) : (
          <div className="space-y-1">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2.5 rounded-lg px-1 py-1"
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
                  aria-label={`${agent.name} (${label})`}
                  onCheckedChange={(active) => onToggleAgent(agent.id, active)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex gap-2">
          {needsReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <RotateCw className="size-3.5" />
              {t("detail.reconnect")}
            </button>
          )}
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Unplug className="size-3.5" />
            {t("detail.disconnect")}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The inline rename input: prefilled with the current alias, Save/Cancel. */
function RenameField({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (alias: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("integrations");
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  // Focus on open so the user can type the alias immediately, without the
  // static `autoFocus` attribute the a11y lint (rightly) rejects.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="flex w-full items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={64}
        placeholder={t("account.renamePlaceholder")}
        aria-label={t("account.renameTitle")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && trimmed) onSave(trimmed);
          if (e.key === "Escape") onCancel();
        }}
        className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-ring"
      />
      <button
        type="button"
        onClick={() => trimmed && onSave(trimmed)}
        disabled={!trimmed}
        aria-label={t("account.save")}
        className="inline-flex size-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-secondary disabled:opacity-50"
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label={t("account.cancel")}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
