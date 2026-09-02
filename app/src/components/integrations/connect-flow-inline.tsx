import { cn, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "./connect-flow-registry";
import { ConnectNoticeLine, NoticeLine } from "./connect-notice-line";
import { WaitingBlock } from "./connect-waiting-block";

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
 * The phases it can show, each a calm single block that grows in place:
 *  - `starting` — the hosted link is still being minted, so the copy says only
 *    that the browser is OPENING. Claiming "we opened {app}" here was a lie the
 *    user could catch, and it is what the phase gate below prevents;
 *  - `waiting`  — the browser IS open: the waiting copy plus the three ways
 *    back (check now, reopen the same page, cancel this one flow);
 *  - `blocked`  — the browser REFUSED to open the page (a popup blocker on
 *    web): the copy says so and the primary action opens it, from a click the
 *    blocker honors;
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
      {step === "waiting" || step === "blocked" ? (
        <WaitingBlock
          appName={appName}
          toolkit={toolkit}
          connectFlow={connectFlow}
          variant={variant}
          blocked={step === "blocked"}
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
