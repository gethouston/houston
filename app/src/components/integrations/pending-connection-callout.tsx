import type { IntegrationConnection } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { ConnectWaitingPanel } from "./connect-waiting-panel";
import type { ConnectFlow } from "./use-connect-flow";

/**
 * The recovery affordance for one connected ACCOUNT that never went active, so a
 * user who abandoned the OAuth mid-flow ALWAYS has a way back:
 *
 *  - while a connect flow is waiting for THIS toolkit → the waiting panel
 *    (Reopen / I have finished / Cancel);
 *  - otherwise `pending` → Finish connecting (a fresh link) + Remove;
 *  - otherwise `error` → Reconnect (a fresh link) + Remove.
 *
 * Keyed on the account (`connection`) so several pending accounts of one app
 * each get their own callout; Remove targets this account's `connectionId`.
 */
export function PendingConnectionCallout({
  connection,
  connectFlow,
  onRemove,
  appName,
}: {
  connection: IntegrationConnection;
  connectFlow: ConnectFlow;
  onRemove: (connectionId: string) => void;
  /** Nicer than the raw slug in the copy; falls back to the toolkit. */
  appName?: string;
}) {
  const { t } = useTranslation("integrations");
  const { toolkit, status } = connection;
  const name = appName ?? toolkit;
  const waitingHere =
    connectFlow.state?.toolkit === toolkit &&
    connectFlow.state.step === "waiting";

  if (waitingHere) {
    return (
      <div className="mt-2">
        <ConnectWaitingPanel appName={name} connectFlow={connectFlow} />
      </div>
    );
  }

  const busy = connectFlow.state !== null;
  const copy =
    status === "pending"
      ? {
          body: t("pendingRecovery.body", { app: name }),
          primary: t("pendingRecovery.finish"),
          remove: t("pendingRecovery.remove"),
        }
      : {
          body: t("errorRecovery.body", { app: name }),
          primary: t("errorRecovery.reconnect"),
          remove: t("errorRecovery.remove"),
        };

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{copy.body}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void connectFlow.connect(toolkit)}
          className="inline-flex h-7 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {copy.primary}
        </button>
        <button
          type="button"
          onClick={() => onRemove(connection.connectionId)}
          className="inline-flex h-7 items-center rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
        >
          {copy.remove}
        </button>
      </div>
    </div>
  );
}
