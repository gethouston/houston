import { useTranslation } from "react-i18next";
import {
  AppRow,
  type ConnectFlow,
  PendingConnectionCallout,
} from "../../integrations";
import type { AgentAppRow as AgentAppRowVM } from "./model";

interface AgentAppRowProps {
  row: AgentAppRowVM;
  connectFlow: ConnectFlow;
  /** Editing rights: mutating affordances only render when true (C4 read-only). */
  canEdit: boolean;
  /** Grants mode: deactivate = drop this agent's grant (the account stays). */
  onDeactivate?: (toolkit: string) => void;
  /** Recovery "Remove": grant-remove in grants mode, disconnect in degraded. */
  onRemove: (toolkit: string) => void;
}

/**
 * One app in this agent's list. An active app shows a deactivate action (grants
 * mode, editor); a pending or errored app shows the shared recovery callout so
 * an abandoned OAuth always has a way back. A read-only viewer sees the live
 * status but no mutating affordances.
 */
export function AgentAppRow({
  row,
  connectFlow,
  canEdit,
  onDeactivate,
  onRemove,
}: AgentAppRowProps) {
  const { t } = useTranslation("integrations");
  const { connection, app } = row;
  const status = connection.status;

  if (status === "active") {
    return (
      <AppRow
        display={app}
        description={app.description}
        status="active"
        trailing={
          canEdit && onDeactivate ? (
            <button
              type="button"
              onClick={() => onDeactivate(connection.toolkit)}
              className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {t("agentTab.deactivate")}
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <AppRow display={app} description={app.description} status={status}>
      {canEdit && (
        <PendingConnectionCallout
          status={status}
          toolkit={connection.toolkit}
          connectFlow={connectFlow}
          onRemove={() => onRemove(connection.toolkit)}
          appName={app.name}
        />
      )}
    </AppRow>
  );
}
