import {
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
} from "@houston-ai/chat";
import { Button, Kbd } from "@houston-ai/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationsGate } from "./integrations/use-integrations-gate";
import { HoustonLogo } from "./shell/agent-avatar";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

interface ChatSigninInteractionCardProps extends StepChrome {
  /** The signin step's stable id — fades the modal body on a step swap. */
  stepId: string;
  /** The reason the agent gave for needing sign-in, rendered as the body's
   *  foreground "why" line beneath the identity row. When absent, it falls back
   *  to "Sign in to Houston". */
  reason?: string;
  /** Fired once the gate resolves `ready` (the Houston session landed) so the
   *  interaction sequence advances past this step. */
  onSignedIn: () => void;
  /** Fired when the user declines this sign-in step ("Not now", live frontier
   *  only). The panel records the skip so the composed reply tells the agent the
   *  user declined, then advances the sequence. */
  onSkip: () => void;
  /** True when the user walked BACK onto this already-reached step via the pager.
   *  Already signed in -> the footer drops (the pager's forward chevron is the
   *  way onward); skipped -> the Sign in CTA returns so the user can reconsider. */
  revisited: boolean;
}

/**
 * The signin-step content for a queued sign-in inside the shared
 * `ChatInteractionCard` sequence (its `renderSignin` prop). A tool call hit
 * `signin_required` (the desktop host has an integration registry but the user
 * is signed out), so the host queued this step; the Sign in button drives the
 * SAME Google SSO the Integrations tab uses (via {@link useIntegrationsGate}),
 * and the sequence advances the instant the gate reports `ready`.
 *
 * Following the reference "Coworker card" language, it renders as its OWN
 * `InteractionModal` (wired with the `StepChrome` the stepper hands it): the
 * TITLE is the identity lockup — the Houston helmet beside the "Houston" name at
 * regular weight — over a two-field body: the agent's REASON (or "Sign in to
 * Houston") in foreground tone, then the muted explainer line. A right-aligned
 * footer carries the unified quiet "Not now" + Esc hint beside the single filled
 * "Sign in" pill (with a return-key glyph). Enter signs in, Esc declines, both
 * ignored while focus sits in a text field.
 *
 * The header pager owns Back/Forward, so a REVISITED step needs no navigation
 * button of its own: already signed in -> no footer; skipped -> the Sign in CTA
 * (and its paired "Not now") return so the user can reconsider. "Not now"
 * travels WITH the Sign in CTA so the decline affordance is present wherever
 * signing in is offered.
 *
 * Auto-advance also covers the STALE step: the user may have signed in elsewhere
 * (the Integrations tab) between the turn ending and this card rendering, so the
 * gate is ALREADY `ready` on first render with no button to click — fire
 * `onSignedIn` once so the queued connects/answers still send.
 */
export function ChatSigninInteractionCard({
  reason,
  onSignedIn,
  onSkip,
  revisited,
  stepId,
  pager,
  onDismiss,
  dismissLabel,
  disabled,
}: ChatSigninInteractionCardProps) {
  const { t } = useTranslation("chat");
  const gate = useIntegrationsGate();

  // Advance at most once, the moment the session is live. A ref, not state:
  // firing must not re-arm on re-render.
  const fired = useRef(false);
  // Track whether the user actively signed in FROM this card. On the frontier
  // the effect fires on `ready` regardless (covering the stale already-signed-in
  // step). On a REVISIT it must NOT auto-fire for a step that was already signed
  // in when it mounted — that would bounce the user off the step they walked
  // Back to; the pager's forward chevron is the way on there. But a revisited
  // SKIPPED step the user now signs in from SHOULD advance, so gate the
  // revisit-suppression on "did the user click Sign in here."
  const signInInitiated = useRef(false);
  useEffect(() => {
    if (gate.kind !== "ready" || fired.current) return;
    if (revisited && !signInInitiated.current) return;
    fired.current = true;
    onSignedIn();
  }, [gate.kind, onSignedIn, revisited]);

  const signedIn = gate.kind === "ready";
  const signingIn = gate.kind === "signin" && gate.signingIn;
  // Sign-in kicked off (browser SSO) or the post-sign-in session resync is in
  // flight (`loading`) / already resolved (`ready`, about to auto-advance):
  // hold the pending look so the button never invites a second click.
  const pending = signingIn || gate.kind === "loading" || gate.kind === "ready";

  // The identity line is the "Houston" name; the agent's reason becomes the
  // body's foreground "why" line (falling back to "Sign in to Houston").
  const reasonLine = reason ?? t("interaction.signinTitle");

  // The CTA shows whenever the user isn't signed in (frontier OR a reconsidered
  // skip). "Not now" travels WITH the CTA so the decline affordance is present
  // wherever signing in is offered.
  const showSignin = !signedIn;
  const showNotNow = showSignin;

  const doSignIn = () => {
    if (gate.kind === "signin") {
      signInInitiated.current = true;
      gate.signIn();
    }
  };

  // Enter signs in (only when the CTA is live), Esc declines (only when "Not
  // now" is offered). Inert while the sign-in / resync is pending; the shared
  // hook owns the editable-target guard + capture-phase pre-emption of the
  // global Escape-closes-the-panel shortcut.
  useInteractionStepKeys({
    enabled: !pending,
    onEnter: showSignin && gate.kind === "signin" ? doSignIn : undefined,
    onEscape: showNotNow ? onSkip : undefined,
  });

  const signInButton = (
    <Button
      className="gap-1.5"
      disabled={pending || gate.kind !== "signin"}
      onClick={doSignIn}
      size="sm"
      type="button"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {t("interaction.signin")}
      {pending ? null : <CornerDownLeft className="size-3.5 opacity-70" />}
    </Button>
  );

  return (
    <InteractionModal
      contentKey={stepId}
      disabled={disabled}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      pager={pager}
      // Title: the Houston helmet beside the "Houston" name (regular weight).
      title={
        <InteractionModalTitle
          className="flex-1 truncate"
          icon={
            <span className="flex size-6 shrink-0 items-center justify-center text-foreground">
              <HoustonLogo size={22} />
            </span>
          }
        >
          {t("interaction.signinAppName")}
        </InteractionModalTitle>
      }
      // Two-field body: the agent's REASON (foreground "why") over the muted
      // explainer line.
      body={
        <div className="flex flex-col gap-1">
          <p className="text-balance text-foreground text-sm leading-snug">
            {reasonLine}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("interaction.signinDescription")}
          </p>
        </div>
      }
      footer={
        showSignin ? (
          <>
            {showNotNow && (
              <Button
                className="gap-1.5 text-muted-foreground"
                disabled={pending}
                onClick={onSkip}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("interaction.skip")}
                <Kbd>{t("interaction.esc")}</Kbd>
              </Button>
            )}
            {signInButton}
          </>
        ) : undefined
      }
    />
  );
}
