import { useTranslation } from "react-i18next";
import { ConnectWaitingPanel } from "./connect-waiting-panel";
import type { ConnectFlow } from "./use-connect-flow";

/**
 * The recovery affordance for a connection that never went active, so a user who
 * abandoned the OAuth mid-flow ALWAYS has a way back:
 *
 *  - while a connect flow is waiting for THIS toolkit → the waiting panel
 *    (Reopen / I have finished / Cancel);
 *  - otherwise `pending` → Finish connecting (a fresh link) + Remove;
 *  - otherwise `error` → Reconnect (a fresh link) + Remove.
 */
export function PendingConnectionCallout({
  status,
  toolkit,
  connectFlow,
  onRemove,
  appName,
}: {
  status: "pending" | "error";
  toolkit: string;
  connectFlow: ConnectFlow;
  onRemove: () => void;
  /** Nicer than the raw slug in the copy; falls back to the toolkit. */
  appName?: string;
}) {
  const { t } = useTranslation("integrations");
  const name = appName ?? toolkit;
  const waitingHere = connectFlow.states[toolkit] === "waiting";

  if (waitingHere) {
    return (
      <div className="mt-2">
        <ConnectWaitingPanel
          appName={name}
          toolkit={toolkit}
          connectFlow={connectFlow}
        />
      </div>
    );
  }

  const busy = Object.keys(connectFlow.states).length > 0;
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
    <div className="mt-2 rounded-xl border border-line bg-input p-3">
      <p className="text-[11px] text-ink-muted">{copy.body}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void connectFlow.connect(toolkit)}
          className="inline-flex h-7 items-center rounded-full bg-action px-3 text-xs font-medium text-action-text transition-colors hover:bg-action/90 disabled:opacity-60"
        >
          {copy.primary}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 items-center rounded-full px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-chip"
        >
          {copy.remove}
        </button>
      </div>
    </div>
  );
}
