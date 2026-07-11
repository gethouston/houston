import { InteractionFooter } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { ExternalLink, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationsGate } from "./integrations/use-integrations-gate";
import { HoustonLogo } from "./shell/agent-avatar";

interface ChatSigninInteractionCardProps {
  /** Fired once the gate resolves `ready` (the Supabase session landed) so the
   *  interaction sequence advances past this step. */
  onSignedIn: () => void;
  /** Fired when the user skips this sign-in step (ghost Skip in the footer, live
   *  frontier only). The panel records the skip so the composed reply tells the
   *  agent the user declined, then advances the sequence via the api. */
  onSkip: () => void;
  /** The card's shared Back node (previous reached step), or null on step one. */
  back: ReactNode;
  /** Advance toward the frontier past this already-reached step, or null on the
   *  live frontier. Non-null means the step is REVISITED: if the user is already
   *  signed in this is the only way onward (a filled Forward — its card can't
   *  re-fire onSignedIn); if it was SKIPPED it renders as a ghost "keep it
   *  skipped" beside a fresh filled Sign in, so the user can reconsider. */
  onForward: (() => void) | null;
}

/**
 * The signin-step content for a queued sign-in inside the shared
 * `ChatInteractionCard` sequence (its `renderSignin` prop). A tool call hit
 * `signin_required` (the desktop host has an integration registry but the user
 * is signed out), so the host queued this step; the Sign in button drives the
 * SAME Google SSO the Integrations tab uses (via {@link useIntegrationsGate}),
 * and the sequence advances the instant the gate reports `ready`.
 *
 * Like the connect step, the interaction card owns the surface + the TITLE (the
 * reason, in the shared header, left-aligned). This body is the step's centered
 * identity HERO: the Houston helmet sits BARE and large on top (never boxed into
 * a chip), the title centered beneath it, one muted line centered under that.
 * The ONE footer stays the shared right-aligned nav row: shared Back, a ghost
 * Skip on the live frontier (the user may decline; the composed reply tells the
 * agent), and the single filled "Sign in" pill.
 *
 * A REVISITED step (`onForward` non-null): if the user is already signed in, the
 * footer shows only a filled Forward (the way onward); if the step was SKIPPED,
 * the full actionable state returns — a ghost Forward ("keep it skipped") beside
 * a fresh filled Sign in — so the user can reconsider and sign in after all.
 *
 * Auto-advance also covers the STALE step: the user may have signed in elsewhere
 * (the Integrations tab) between the turn ending and this card rendering, so the
 * gate is ALREADY `ready` on first render with no button to click — fire
 * `onSignedIn` once so the queued connects/answers still send.
 */
export function ChatSigninInteractionCard({
  onSignedIn,
  onSkip,
  back,
  onForward,
}: ChatSigninInteractionCardProps) {
  const { t } = useTranslation("chat");
  const gate = useIntegrationsGate();

  const revisited = onForward !== null;
  // Advance at most once, the moment the session is live. A ref, not state:
  // firing must not re-arm on re-render.
  const fired = useRef(false);
  // Track whether the user actively signed in FROM this card. On the frontier
  // the effect fires on `ready` regardless (covering the stale already-signed-in
  // step). On a REVISIT it must NOT auto-fire for a step that was already
  // signed in when it mounted — that would bounce the user off the step they
  // walked Back to; the Forward pill is the way on there. But a revisited
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

  const signInButton = (
    <Button
      className="gap-1"
      disabled={pending || gate.kind !== "signin"}
      onClick={() => {
        if (gate.kind === "signin") {
          signInInitiated.current = true;
          gate.signIn();
        }
      }}
      size="sm"
      type="button"
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : null}
      {t("interaction.signin")}
      {pending ? null : <ExternalLink className="size-3" />}
    </Button>
  );

  return (
    <div className="mt-5 flex flex-col">
      {/* Centered identity hero: the Houston helmet on top, title + one muted
          line centered beneath, generous vertical rhythm. */}
      <div className="flex flex-col items-center gap-3 px-2 py-2 text-center">
        <span className="flex size-14 shrink-0 items-center justify-center text-foreground">
          <HoustonLogo size={40} />
        </span>
        <div className="flex min-w-0 flex-col items-center gap-1">
          <span className="max-w-full truncate font-medium text-base text-foreground">
            {t("interaction.signinTitle")}
          </span>
          <span className="max-w-full text-muted-foreground text-xs">
            {t("interaction.signinDescription")}
          </span>
        </div>
      </div>

      <InteractionFooter>
        {back}
        {onForward === null ? (
          // Live frontier: ghost Skip (declines) beside filled Sign in.
          <>
            {!signedIn && (
              <Button
                disabled={pending}
                onClick={onSkip}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("questionCard.skip")}
              </Button>
            )}
            {signInButton}
          </>
        ) : signedIn ? (
          // Revisited + signed in: Forward is the only way onward (filled).
          <Button onClick={onForward} size="sm" type="button">
            {t("questionCard.forward")}
          </Button>
        ) : (
          // Revisited + skipped: reconsider — ghost "keep it skipped" Forward
          // beside a fresh filled Sign in.
          <>
            <Button
              disabled={pending}
              onClick={onForward}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("questionCard.forward")}
            </Button>
            {signInButton}
          </>
        )}
      </InteractionFooter>
    </div>
  );
}
