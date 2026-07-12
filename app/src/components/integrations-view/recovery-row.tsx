import {
  AppLogo,
  type ConnectFlow,
  ConnectionStatusBadge,
  PendingConnectionCallout,
  type RecoveringAppRow,
} from "../integrations";

/**
 * One interrupted-OAuth connection on the browse plane, shown quietly under the
 * hero and above the Installed strip so a user who abandoned a connect always
 * has a calm way back. Flat in the plane language — a transparent container (no
 * border, no chip fill), a top identity line (logo + name + status badge), and
 * the shared {@link PendingConnectionCallout} beneath as the action affordance
 * (Finish connecting / Reconnect + Remove; it carries its own quiet input-surface
 * panel). Purely presentational; the parent owns the connect flow and removal.
 */
export function RecoveryRow({
  row,
  connectFlow,
  onRemove,
}: {
  row: RecoveringAppRow;
  connectFlow: ConnectFlow;
  onRemove: () => void;
}) {
  const { connection, app } = row;
  const status = connection.status === "error" ? "error" : "pending";
  return (
    <div className="rounded-2xl px-3 py-3">
      <div className="flex items-center gap-4">
        <AppLogo display={app} size="lg" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {app.name}
        </span>
        <ConnectionStatusBadge status={status} />
      </div>
      <PendingConnectionCallout
        status={status}
        toolkit={connection.toolkit}
        connectFlow={connectFlow}
        appName={app.name}
        onRemove={onRemove}
      />
    </div>
  );
}
