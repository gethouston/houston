import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AppRow,
  accountDisplayLabel,
  type ConnectFlow,
  ConnectionStatusBadge,
  PendingConnectionCallout,
} from "../../integrations";
import type { AgentAppRow as AgentAppRowVM } from "./model";

interface AgentAppRowProps {
  row: AgentAppRowVM;
  connectFlow: ConnectFlow;
  /** Editing rights: mutating affordances only render when true (C4 read-only). */
  canEdit: boolean;
  /** Grants mode: deactivate = drop this agent's grant for THIS account. */
  onDeactivate?: (connectionId: string) => void;
  /** Recovery "Remove": grant-remove in grants mode, disconnect in degraded. */
  onRemove: (connectionId: string) => void;
  /** Re-run the connect flow for this toolkit to link another login of the app. */
  onAddAccount?: (toolkit: string) => void;
}

/**
 * One connected ACCOUNT in this agent's list. When its toolkit has more than one
 * account here the row shows the account label so the two stay distinguishable.
 * An active account shows a deactivate action plus an "add another account"
 * affordance (grants mode, editor); a pending or errored account shows the shared
 * recovery callout so an abandoned OAuth always has a way back. A read-only viewer
 * sees the live status but no mutating affordances.
 */
export function AgentAppRow({
  row,
  connectFlow,
  canEdit,
  onDeactivate,
  onRemove,
  onAddAccount,
}: AgentAppRowProps) {
  const { t } = useTranslation("integrations");
  const { connection, app, showAccountLabel } = row;
  const status = connection.status;
  const description = showAccountLabel
    ? accountDisplayLabel(connection, t("account.unnamed"))
    : app.description;

  if (status === "active") {
    const showActions =
      canEdit && (onAddAccount != null || onDeactivate != null);
    return (
      <AppRow
        display={app}
        description={description}
        status="active"
        trailing={
          showActions ? (
            <div className="flex items-center gap-1">
              {onAddAccount && (
                <button
                  type="button"
                  onClick={() => onAddAccount(connection.toolkit)}
                  disabled={connectFlow.state !== null}
                  aria-label={t("account.addAnother")}
                  title={t("account.addAnother")}
                  className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
              {onDeactivate && (
                <button
                  type="button"
                  onClick={() => onDeactivate(connection.connectionId)}
                  className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {t("agentTab.deactivate")}
                </button>
              )}
            </div>
          ) : undefined
        }
      />
    );
  }

  return (
    <AppRow
      display={app}
      description={description}
      status={status}
      trailing={
        !canEdit ? <ConnectionStatusBadge status={status} /> : undefined
      }
    >
      {canEdit && (
        <PendingConnectionCallout
          connection={connection}
          connectFlow={connectFlow}
          onRemove={onRemove}
          appName={app.name}
        />
      )}
    </AppRow>
  );
}
