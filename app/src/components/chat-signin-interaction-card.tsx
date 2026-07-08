import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RowCard } from "./cards/row-card";
import { RowCardButton } from "./cards/row-card-button";
import { useIntegrationsGate } from "./integrations/use-integrations-gate";
import { HoustonLogo } from "./shell/agent-avatar";

interface ChatSigninInteractionCardProps {
  /** Why the agent needs the user signed in, shown above the card when present. */
  reason?: string;
  /** Fired once the gate resolves `ready` (the Supabase session landed) so the
   *  interaction sequence advances past this step. */
  onSignedIn: () => void;
}

/**
 * The signin-step content for a queued sign-in inside the shared
 * {@link ChatInteractionCard} sequence (its `renderSignin` prop). A tool call hit
 * `signin_required` (the desktop host has an integration registry but the user
 * is signed out), so the host queued this step; the Sign in button drives the
 * SAME Google SSO the Integrations tab uses (via {@link useIntegrationsGate}),
 * and the sequence advances the instant the gate reports `ready`.
 *
 * Auto-advance also covers the STALE step: the user may have signed in elsewhere
 * (the Integrations tab) between the turn ending and this card rendering, so the
 * gate is ALREADY `ready` on first render with no button to click — fire
 * `onSignedIn` once so the queued connects/answers still send, mirroring the
 * connect card's already-connected self-report.
 */
export function ChatSigninInteractionCard({
  reason,
  onSignedIn,
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
    <div className="flex flex-col gap-2">
      <p className="text-sm text-foreground">
        {reason ?? t("interaction.signinReason")}
      </p>
      <RowCard
        surface="secondary"
        media={<HoustonLogo size={20} />}
        title={t("interaction.signinTitle")}
        description={t("interaction.signinDescription")}
        action={
          <RowCardButton
            label={t("interaction.signin")}
            onClick={() => {
              if (gate.kind === "signin") gate.signIn();
            }}
            loading={pending}
            disabled={gate.kind !== "signin"}
          />
        }
      />
    </div>
  );
}
