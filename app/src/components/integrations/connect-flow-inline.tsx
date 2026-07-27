import { AsyncButton, Button, cn, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "./connect-flow-registry";
import { ConnectNoticeLine, NoticeLine } from "./connect-notice-line";

/**
 * How the block dresses itself.
 *  - `"panel"` — its own bordered `input`-surface box with a leading spinner.
 *    For the surfaces that host the block ALONE (the routine intake), where
 *    nothing around it reports the hand-off.
 *  - `"bare"` — no box and no spinner of its own. For the catalog row, whose
 *    WHOLE row becomes the card and whose `+` slot carries the one spinner: a
 *    second frame inside that card, and a second spinner under the first, are
 *    the same news told twice.
 */
export type ConnectFlowVariant = "panel" | "bare";

/**
 * Does this toolkit have anything for {@link ConnectFlowInline} to show — a
 * live phase, or an outcome still inside its expiry window? A surface that
 * DRESSES the block (the catalog row becomes a card around it) asks first, so
 * the chrome and the content appear and leave as one.
 */
export function hasConnectState(
  connectFlow: ConnectFlow,
  toolkit: string,
): boolean {
  return toolkit in connectFlow.states || toolkit in connectFlow.notices;
}

/**
 * ONE app's connect state, rendered INLINE where the user started it — inside
 * the catalog card the pressed row became, under the intake's connect prompt.
 * It is the only "we are connecting"
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
 *
 * WHICH copy of a repeated app shows it is the host surface's call, not this
 * component's: the catalog decides by origin key and simply does not render the
 * block on the copies that did not start the flow.
 */
export function ConnectFlowInline({
  toolkit,
  appName,
  connectFlow,
  className,
  variant = "panel",
}: {
  /** The toolkit this block reports on; its actions address that flow only. */
  toolkit: string;
  /** The app's real name, never the machine slug. */
  appName: string;
  connectFlow: ConnectFlow;
  className?: string;
  variant?: ConnectFlowVariant;
}) {
  const { t } = useTranslation("integrations");
  const step = connectFlow.states[toolkit];
  const notice = connectFlow.notices[toolkit];

  if (!step && !notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("text-[13px]", className)}
    >
      {step === "waiting" ? (
        <WaitingBlock
          appName={appName}
          toolkit={toolkit}
          connectFlow={connectFlow}
          variant={variant}
        />
      ) : step === "starting" ? (
        <NoticeLine
          // `bare` sits in a card whose `+` slot is already spinning.
          icon={
            variant === "panel" ? <Spinner className="size-3.5" /> : undefined
          }
          tone="muted"
        >
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
 * the three recovery actions. As a `panel` it wears a quiet input-surface box
 * for the surfaces that host it alone; as `bare` it is already inside the
 * catalog row's own card and brings no frame and no spinner of its own.
 */
function WaitingBlock({
  appName,
  toolkit,
  connectFlow,
  variant,
}: {
  appName: string;
  toolkit: string;
  connectFlow: ConnectFlow;
  variant: ConnectFlowVariant;
}) {
  const { t } = useTranslation("integrations");
  const copy = (
    <>
      <p className="font-medium text-ink">
        {t("waiting.title", { app: appName })}
      </p>
      {/* The body names the app too: it was shipping the raw "{{app}}"
          placeholder, because the old panel never passed the value in. */}
      <p className="mt-0.5 text-ink-muted text-xs">
        {t("waiting.body", { app: appName })}
      </p>
    </>
  );
  return (
    <div
      className={
        variant === "panel"
          ? "rounded-xl border border-line bg-input p-3"
          : undefined
      }
    >
      {variant === "panel" ? (
        <div className="flex items-start gap-2.5">
          <Spinner className="mt-0.5 size-4 text-ink-muted" />
          <div className="min-w-0 flex-1">{copy}</div>
        </div>
      ) : (
        copy
      )}
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
