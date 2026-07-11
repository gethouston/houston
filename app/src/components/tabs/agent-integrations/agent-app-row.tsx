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
  /** Recovery "Remove": disconnect the connection from the account. */
  onRemove: (toolkit: string) => void;
}

/**
 * One app in this agent's list. An active app shows its live status only (no
 * grant toggle — activating a connection for an agent lives in Settings >
 * Connected accounts). A pending or errored app shows the shared recovery
 * callout so an abandoned OAuth always has a way back, whose "Remove"
 * disconnects the connection. A read-only viewer sees status but no affordances.
 */
export function AgentAppRow({
  row,
  connectFlow,
  canEdit,
  onRemove,
}: AgentAppRowProps) {
  const { connection, app } = row;
  const status = connection.status;

  if (status === "active") {
    return (
      <AppRow display={app} description={app.description} status="active" />
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
