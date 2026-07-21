import { Button } from "@houston-ai/core";
import confetti from "canvas-confetti";
import { Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCapabilities } from "../../../hooks/use-capabilities";
import { CreateTeamDialog } from "../../shell/create-team-dialog";
import { SetupCard } from "../setup-card";
import { SuccessCheck } from "../success-check";
import { shouldOfferTeamInvite } from "./onboarding-flow";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A few overlapping bursts for the "your assistant just acted for you" payoff. */
function fireConfetti() {
  if (prefersReducedMotion()) return;
  const base = { startVelocity: 45, ticks: 220, zIndex: 9999, scalar: 0.9 };
  confetti({
    ...base,
    particleCount: 140,
    spread: 80,
    origin: { x: 0.5, y: 0.55 },
  });
  confetti({
    ...base,
    particleCount: 70,
    spread: 60,
    angle: 60,
    origin: { x: 0, y: 0.7 },
  });
  confetti({
    ...base,
    particleCount: 70,
    spread: 60,
    angle: 120,
    origin: { x: 1, y: 0.7 },
  });
}

interface FinishedMissionProps {
  /** Which finish this is:
   *  - "sent": the assistant actually sent a real email (the full email path).
   *  - "ready": the deployment has no integrations, so no email was sent and
   *    the copy must not claim one. */
  variant: "sent" | "ready";
  /** The one action on this screen: arm the guided tour and jump into the
   *  assistant's Routines surface so the freshly-seeded content is immediately
   *  visible. */
  onStart: () => void;
}

/**
 * The single onboarding payoff screen. Reached after the assistant sent a real
 * email ("sent"), or when the email detour is unavailable ("ready"). It
 * celebrates and offers exactly ONE primary action, no secondary escape hatch
 * (design principle: one obvious action per screen) — an
 * inspiring send-off, not a decision. The `variant` keeps the copy truthful: it
 * only claims a real email was sent on the path that actually sent one.
 *
 * On a deployment that serves C8 Spaces (self-serve teams) a single quiet text
 * link sits under the CTA to create a team — main's growth affordance, kept
 * subordinate to the one obvious action so the screen stays focused.
 */
export function FinishedMission({ variant, onStart }: FinishedMissionProps) {
  const { t } = useTranslation("setup");
  const { capabilities } = useCapabilities();
  const [inviteOpen, setInviteOpen] = useState(false);
  const offerInvite = shouldOfferTeamInvite(capabilities);

  useEffect(() => {
    fireConfetti();
  }, []);

  const titleKey =
    variant === "sent"
      ? "tutorial.missions.finished.title"
      : "tutorial.missions.finished.readyTitle";
  const bodyKey =
    variant === "sent"
      ? "tutorial.missions.finished.body"
      : "tutorial.missions.finished.readyBody";

  return (
    <SetupCard>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <SuccessCheck />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t(titleKey)}
          </h1>
          <p className="max-w-md text-sm text-ink-muted">
            {t(bodyKey)}
            <br />
            {t("tutorial.missions.finished.tagline")}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            className="h-11 rounded-full px-5"
            onClick={onStart}
          >
            <Rocket className="size-4" />
            {t("tutorial.missions.finished.cta")}
          </Button>
          {offerInvite && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="text-xs text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {t("tutorial.missions.finished.inviteTeam")}
            </button>
          )}
        </div>
      </div>
      {offerInvite && (
        <CreateTeamDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
    </SetupCard>
  );
}
