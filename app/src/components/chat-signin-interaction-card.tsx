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
  /** Fired when the user skips this sign-in step (ghost Skip in the footer).
   *  The panel records the skip so the composed reply tells the agent the user
   *  declined, then advances the sequence via the card api. */
  onSkip: () => void;
  /** The card's shared Back node (previous reached step), or null on step one. */
  back: ReactNode;
  /** The card's shared Forward node for a REVISITED, already signed-in step
   *  (its card can't re-fire onSignedIn); rendered INSTEAD of the Sign in CTA
   *  when present. Null on the live frontier. */
  forward: ReactNode;
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
 * reason, in the shared header), so this body draws NO surface and NO borders:
 * the Houston helmet sits BARE in the same size-10 slot the connect step gives
 * the app's brand logo (never boxed into a chip), leading the identity stack.
 * The ONE footer mirrors a question step's grammar: shared Back, a ghost Skip
 * (the user may decline; the composed reply tells the agent), and the single
 * filled "Sign in" pill.
 *
 * Auto-advance also covers the STALE step: the user may have signed in elsewhere
 * (the Integrations tab) between the turn ending and this card rendering, so the
 * gate is ALREADY `ready` on first render with no button to click — fire
 * `onSignedIn` once so the queued connects/answers still send, mirroring the
 * connect card's already-connected self-report.
 */
export function ChatSigninInteractionCard({
  onSignedIn,
  onSkip,
  back,
  forward,
}: ChatSigninInteractionCardProps) {
  const { t } = useTranslation("chat");
  const gate = useIntegrationsGate();

  // Advance at most once, the moment the session is live — whether the user
  // signed in from the button here or had already signed in before the card
  // mounted (stale step). A ref, not state: firing must not re-arm on re-render.
  // Frontier-only (`forward` null): a REVISITED signed-in step mounts a fresh
  // card whose ready gate would otherwise re-fire and bounce the user straight
  // off the step they walked Back to — there, the Forward pill is the way on.
  const fired = useRef(false);
  const revisited = forward !== null;
  useEffect(() => {
    if (gate.kind === "ready" && !fired.current && !revisited) {
      fired.current = true;
      onSignedIn();
    }
  }, [gate.kind, onSignedIn, revisited]);

  const signingIn = gate.kind === "signin" && gate.signingIn;
  // Sign-in kicked off (browser SSO) or the post-sign-in session resync is in
  // flight (`loading`) / already resolved (`ready`, about to auto-advance):
  // hold the pending look so the button never invites a second click.
  const pending = signingIn || gate.kind === "loading" || gate.kind === "ready";

  return (
    <div className="mt-4 flex flex-col">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center text-foreground">
          <HoustonLogo size={28} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground text-sm">
            {t("interaction.signinTitle")}
          </span>
          <span className="truncate text-muted-foreground text-xs">
            {t("interaction.signinDescription")}
          </span>
        </div>
      </div>

      <InteractionFooter>
        {back}
        {forward ?? (
          <>
            <Button
              disabled={pending}
              onClick={onSkip}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("questionCard.skip")}
            </Button>
            <Button
              className="gap-1"
              disabled={pending || gate.kind !== "signin"}
              onClick={() => {
                if (gate.kind === "signin") gate.signIn();
              }}
              size="sm"
              type="button"
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : null}
              {t("interaction.signin")}
              {pending ? null : <ExternalLink className="size-3" />}
            </Button>
          </>
        )}
      </InteractionFooter>
    </div>
  );
}
