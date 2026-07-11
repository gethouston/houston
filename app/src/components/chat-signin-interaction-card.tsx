import { InteractionFooter } from "@houston-ai/chat";
import { Button, Kbd } from "@houston-ai/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationsGate } from "./integrations/use-integrations-gate";
import { HoustonLogo } from "./shell/agent-avatar";

interface ChatSigninInteractionCardProps {
  /** The reason the agent gave for needing sign-in, routed into the card's bold
   *  title. When absent, the title falls back to "Sign in to Houston". */
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
 * Following the reference "Coworker card" language, this is a COMPACT
 * left-aligned lockup: the Houston helmet inline with a bold title (the reason,
 * or "Sign in to Houston"), one muted line beneath, and a right-aligned footer
 * of a quiet "Not now" + Esc hint beside the single filled "Sign in" pill (with
 * a return-key glyph). This REVERSES the earlier centered identity hero. Enter
 * signs in, Esc declines, both ignored while focus sits in a text field.
 *
 * The header pager owns Back/Forward, so a REVISITED step needs no navigation
 * button of its own: already signed in -> no footer; skipped -> the Sign in CTA
 * returns so the user can reconsider.
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

  const title = reason ?? t("interaction.signinTitle");

  // The CTA shows whenever the user isn't signed in (frontier OR a reconsidered
  // skip); "Not now" only on the live frontier.
  const showSignin = !signedIn;
  const showNotNow = !revisited && !signedIn;

  const doSignIn = () => {
    if (gate.kind === "signin") {
      signInInitiated.current = true;
      gate.signIn();
    }
  };

  // Enter signs in, Esc declines. Ignored while typing in a field. Runs in the
  // CAPTURE phase and stops the event dead when it acts, so Esc decides "not
  // now" here instead of falling through to the global Escape-closes-the-panel
  // shortcut (use-keyboard-shortcuts.ts).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;
      if (isEditable || pending) return;
      if (e.key === "Enter" && showSignin && gate.kind === "signin") {
        e.preventDefault();
        e.stopImmediatePropagation();
        doSignIn();
      } else if (e.key === "Escape" && showNotNow) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
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
    <div className="mt-4 flex flex-col">
      {/* Compact left-aligned lockup: the Houston helmet inline with the bold
          title, one muted line beneath. */}
      <div className="flex items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center text-foreground">
          <HoustonLogo size={22} />
        </span>
        <span className="min-w-0 flex-1 text-balance font-semibold text-base text-foreground leading-snug">
          {title}
        </span>
      </div>
      <p className="mt-1.5 text-muted-foreground text-sm">
        {t("interaction.signinDescription")}
      </p>

      {showSignin && (
        <InteractionFooter>
          {showNotNow && (
            <Button
              className="gap-1.5 text-muted-foreground"
              disabled={pending}
              onClick={onSkip}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("interaction.notNow")}
              <Kbd>{t("interaction.esc")}</Kbd>
            </Button>
          )}
          {signInButton}
        </InteractionFooter>
      )}
    </div>
  );
}
