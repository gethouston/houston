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
 * reason, in the shared header), so this body draws NO surface: a hairline
 * Houston row and the ONE footer with a single filled "Sign in" pill beside the
 * shared Back node. No card-inside-a-card.
 *
 * Auto-advance also covers the STALE step: the user may have signed in elsewhere
 * (the Integrations tab) between the turn ending and this card rendering, so the
 * gate is ALREADY `ready` on first render with no button to click — fire
 * `onSignedIn` once so the queued connects/answers still send, mirroring the
 * connect card's already-connected self-report.
 */
export function ChatSigninInteractionCard({
  onSignedIn,
  back,
  forward,
}: ChatSigninInteractionCardProps) {
  const { t } = useTranslation("chat");
  const gate = useIntegrationsGate();

  // Advance at most once, the moment the session is live — whether the user
  // signed in from the button here or had already signed in before the card
  // mounted (stale step). A ref, not state: firing must not re-arm on re-render.
  const fired = useRef(false);
  useEffect(() => {
    if (gate.kind === "ready" && !fired.current) {
      fired.current = true;
      onSignedIn();
    }
  }, [gate.kind, onSignedIn]);

  const signingIn = gate.kind === "signin" && gate.signingIn;
  // Sign-in kicked off (browser SSO) or the post-sign-in session resync is in
  // flight (`loading`) / already resolved (`ready`, about to auto-advance):
  // hold the pending look so the button never invites a second click.
  const pending = signingIn || gate.kind === "loading" || gate.kind === "ready";

  return (
    <div className="mt-4 flex flex-col">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 px-3.5 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <HoustonLogo size={18} />
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
        )}
      </InteractionFooter>
    </div>
  );
}
