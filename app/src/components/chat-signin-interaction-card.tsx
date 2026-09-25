import type { StepChrome } from "@houston-ai/chat";
import { Button, HoustonHelmet } from "@houston-ai/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import { useIntegrationsGate } from "./integrations/use-integrations-gate";

interface ChatSigninInteractionCardProps extends StepChrome, StepDraftApi {
  /** The signin step's stable id — fades the modal body on a step swap. */
  stepId: string;
  /** The reason the agent gave for needing sign-in, rendered as the body's
   *  foreground "why" line beneath the identity row. When absent, it falls back
   *  to "Sign in to Houston". */
  reason?: string;
  /** Fired once the gate resolves `ready` (the Houston session landed) so the
   *  interaction sequence advances past this step. */
  onSignedIn: () => void;
  /** Fired when the user declines this sign-in step: "Not now" (live frontier
   *  only) passes no `message`; typing an instruction into the free-text row and
   *  sending passes that verbatim text. The panel records the decline (with the
   *  message, if any, so the composed reply relays it) then advances. */
  onSkip: (message?: string) => void;
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
 * SAME Google SSO the Integrations page uses (via {@link useIntegrationsGate}),
 * and the sequence advances the instant the gate reports `ready`.
 *
 * It renders through the shared {@link ChatConnectStepShell}: the TITLE is the
 * identity lockup — the Houston helmet beside the "Houston" name — over the
 * agent's REASON (or "Sign in to Houston") plus the muted explainer line, with
 * the unified quiet decline beside the single filled "Sign in" pill. Enter signs
 * in, Esc declines. A signed-in step keeps its body (there is no "done" line for
 * an identity the user still wants to read) and simply drops the footer, so the
 * pager's forward chevron is the way onward; a revisited SKIPPED step gets its
 * CTA back so the user can reconsider.
 *
 * Auto-advance also covers the STALE step: the user may have signed in elsewhere
 * (the Integrations page) between the turn ending and this card rendering, so the
 * gate is ALREADY `ready` on first render with no button to click — fire
 * `onSignedIn` once so the queued connects/answers still send.
 */
export function ChatSigninInteractionCard({
  reason,
  onSignedIn,
  onSkip,
  revisited,
  stepId,
  ...chrome
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

  const doSignIn = () => {
    if (gate.kind === "signin") {
      signInInitiated.current = true;
      gate.signIn();
    }
  };

  return (
    <ChatConnectStepShell
      {...chrome}
      busy={pending}
      // A signed-in step keeps its body: the identity line still answers "who
      // is the agent acting as", so there is nothing calmer to swap it for.
      done={signedIn}
      cta={
        signedIn ? undefined : (
          <Button
            className="gap-1.5"
            disabled={pending || gate.kind !== "signin"}
            onClick={doSignIn}
            size="sm"
            type="button"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("interaction.signin")}
            {pending ? null : (
              <CornerDownLeft className="size-3.5 opacity-70" />
            )}
          </Button>
        )
      }
      icon={
        <span className="flex size-6 shrink-0 items-center justify-center text-ink">
          <HoustonHelmet color="currentColor" size={22} />
        </span>
      }
      onDecline={onSkip}
      onEnter={!signedIn && gate.kind === "signin" ? doSignIn : undefined}
      // The identity line is the "Houston" name; the agent's reason becomes the
      // body's foreground "why" line (falling back to "Sign in to Houston").
      reason={reason ?? t("interaction.signinTitle")}
      stepId={stepId}
      title={t("interaction.signinAppName")}
    >
      <p className="text-ink-muted text-sm">
        {t("interaction.signinDescription")}
      </p>
    </ChatConnectStepShell>
  );
}
