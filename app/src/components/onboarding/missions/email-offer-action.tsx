import { Button } from "@houston-ai/core";
import { ArrowRight } from "lucide-react";

interface EmailOfferActionProps {
  description: string;
  label: string;
  onStart: () => void;
}

/**
 * The one deliberate action that starts the live email demonstration — and,
 * since the reply composer stays hidden until the mission starts, the ONLY
 * action on the step. It sits directly on the card (no boxed sub-surface,
 * which read as a detached widget) with a quiet focus-token halo so the CTA
 * is discoverable without borrowing the animated running glow, which is
 * reserved for work already in progress.
 */
export function EmailOfferAction({
  description,
  label,
  onStart,
}: EmailOfferActionProps) {
  return (
    <div data-onboarding-email-offer>
      <p className="mb-4 text-center text-sm text-ink-muted">{description}</p>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full bg-focus/10 blur-sm"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full ring-1 ring-focus/30"
        />
        <Button
          className="relative h-12 w-full justify-between rounded-full px-5"
          onClick={onStart}
          size="lg"
          type="button"
        >
          <span>{label}</span>
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
