import { Button } from "@houston-ai/core";
import { ArrowRight } from "lucide-react";

interface EmailOfferActionProps {
  description: string;
  label: string;
  onStart: () => void;
}

/**
 * The one deliberate action that starts the live email demonstration. It uses
 * a quiet focus-token halo so the CTA is discoverable without borrowing the
 * animated running glow, which is reserved for work already in progress.
 */
export function EmailOfferAction({
  description,
  label,
  onStart,
}: EmailOfferActionProps) {
  return (
    <div
      className="rounded-xl border border-line/60 bg-input p-3"
      data-onboarding-email-offer
    >
      <p className="mb-3 text-sm text-ink">{description}</p>
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
          className="relative h-11 w-full justify-between rounded-full px-4"
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
