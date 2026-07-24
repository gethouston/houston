import { AsyncButton, Button, cn, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "./connect-flow-registry";
import { ConnectNoticeLine, NoticeLine } from "./connect-notice-line";

/**
 * ONE app's connect state, rendered INLINE where the user started it — under
 * the catalog row whose `+` they pressed, under the recovery row's identity
 * line, under the intake's connect prompt. It is the only "we are connecting"
 * surface: there is no page-level banner, so nothing the user is reading ever
 * jumps to make room for feedback about a row far above it.
 *
 * The four phases it can show, each a calm single block that grows in place:
 *  - `starting` — the hosted link is still being minted, so the copy says only
 *    that the browser is OPENING. Claiming "we opened {app}" here was a lie the
 *    user could catch, and it is what the phase gate below prevents;
 *  - `waiting`  — the browser IS open: the waiting copy plus the three ways
 *    back (check now, reopen the same page, cancel this one flow);
 *  - `connected` / `failed` / `stopped` — the settled outcome, held for a few
 *    seconds so the row confirms in place instead of silently snapping back.
 *    The words are deliberately short: the toast carries the full sentence (it
 *    has to, the user may have navigated away), so repeating it here would say
 *    the same thing three times over.
 *
 * The whole block is a polite live region, so the starting -> waiting ->
 * settled progression is announced without stealing focus. Renders nothing
 * when this toolkit has no live flow and no fresh outcome.
 */
export function ConnectFlowInline({
  toolkit,
  appName,
  connectFlow,
  className,
  owns = true,
}: {
  /** The toolkit this block reports on; its actions address that flow only. */
  toolkit: string;
  /** The app's real name, never the machine slug. */
  appName: string;
  connectFlow: ConnectFlow;
  className?: string;
  /**
   * Whether THIS row is the one that shows the state. A surface that renders
   * the same app more than once (the catalog's "Most used" spotlight repeats
   * category rows) passes `false` on every copy that did not start the flow, so
   * the panel — and its live region — exists exactly once. Surfaces with a
   * single row per app leave it at the default.
   */
  owns?: boolean;
}) {
  const { t } = useTranslation("integrations");
  const step = connectFlow.states[toolkit];
  const notice = connectFlow.notices[toolkit];

  if (!owns || (!step && !notice)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("text-[13px]", className)}
    >
      {step === "waiting" ? (
        <WaitingPanel
          appName={appName}
          toolkit={toolkit}
          connectFlow={connectFlow}
        />
      ) : step === "starting" ? (
        <NoticeLine icon={<Spinner className="size-3.5" />} tone="muted">
          {t("waiting.opening", { app: appName })}
        </NoticeLine>
      ) : notice ? (
        <ConnectNoticeLine appName={appName} notice={notice} />
      ) : null}
    </div>
  );
}

/**
 * The waiting step's compact expansion: the browser hand-off explained, plus
 * the three recovery actions. Same quiet input-surface panel language as the
 * pending-connection recovery callout, so an interrupted OAuth reads the same
 * whether the user is still in the flow or comes back to it later.
 */
function WaitingPanel({
  appName,
  toolkit,
  connectFlow,
}: {
  appName: string;
  toolkit: string;
  connectFlow: ConnectFlow;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="rounded-xl border border-line bg-input p-3">
      <div className="flex items-start gap-2.5">
        <Spinner className="mt-0.5 size-4 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            {t("waiting.title", { app: appName })}
          </p>
          {/* The body names the app too: it was shipping the raw "{{app}}"
              placeholder, because the old panel never passed the value in. */}
          <p className="mt-0.5 text-ink-muted text-xs">
            {t("waiting.body", { app: appName })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Waking the poll is synchronous — nothing to await, so nothing for an
            AsyncButton's in-flight guard to hold. */}
        <Button
          size="xs"
          type="button"
          onClick={() => connectFlow.checkNow(toolkit)}
        >
          {t("waiting.check")}
        </Button>
        <AsyncButton
          size="xs"
          variant="outline"
          spinner={false}
          onClick={() => connectFlow.reopen(toolkit)}
        >
          {t("waiting.reopen")}
        </AsyncButton>
        <Button
          size="xs"
          variant="ghost"
          type="button"
          onClick={() => connectFlow.cancel(toolkit)}
        >
          {t("waiting.cancel")}
        </Button>
      </div>
    </div>
  );
}
