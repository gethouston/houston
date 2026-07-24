import { AsyncButton, Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { ConnectFlowInline } from "./connect-flow-inline";
import type { ConnectFlow } from "./connect-flow-registry";
import { ConnectNoticeLine } from "./connect-notice-line";

/**
 * The recovery affordance for a connection that never went active, so a user who
 * abandoned the OAuth mid-flow ALWAYS has a way back:
 *
 *  - while a connect flow for THIS toolkit is LIVE → the shared inline state
 *    ({@link ConnectFlowInline}: the browser hand-off and its Reopen / I have
 *    finished / Cancel actions);
 *  - otherwise `pending` → Finish connecting (a fresh link) + Remove;
 *  - otherwise `error` → Reconnect (a fresh link) + Remove.
 *
 * A just-SETTLED outcome is shown above those actions, never instead of them:
 * gating the swap on the notice too meant a failed attempt replaced the
 * Reconnect button — the one thing its own copy tells the user to press — for
 * the six seconds the notice lives.
 *
 * The primary action is an {@link AsyncButton} holding the whole hand-off, so a
 * rage click can't start a second flow; it is gated on nothing else. Another
 * app connecting in a different row is irrelevant here (flows are per toolkit
 * and concurrent), and gating on it is what used to freeze the whole surface.
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

  if (toolkit in connectFlow.states) {
    return (
      <ConnectFlowInline
        appName={name}
        className="mt-2"
        connectFlow={connectFlow}
        toolkit={toolkit}
      />
    );
  }

  const notice = connectFlow.notices[toolkit];
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
    <div className="mt-2 rounded-xl border border-line bg-input p-3 text-[13px]">
      {notice && (
        <div role="status" aria-live="polite" className="mb-2">
          <ConnectNoticeLine appName={name} notice={notice} />
        </div>
      )}
      <p className="text-ink-muted text-xs">{copy.body}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <AsyncButton
          size="xs"
          spinner={false}
          // The recovery row is the only copy of this app on its surface, so it
          // always shows its own flow's state — the origin is bookkeeping.
          onClick={() => connectFlow.connect(toolkit, `recovery:${toolkit}`)}
        >
          {copy.primary}
        </AsyncButton>
        <Button size="xs" type="button" variant="ghost" onClick={onRemove}>
          {copy.remove}
        </Button>
      </div>
    </div>
  );
}
