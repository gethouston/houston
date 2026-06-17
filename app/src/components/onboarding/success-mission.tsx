import { Check } from "lucide-react";

import { SetupCard } from "./setup-card";

interface SuccessMissionProps {
  title: string;
  body: string;
  ctaLabel: string;
  onContinue: () => void;
  /** Loading state while the CTA kicks off async work (e.g. creating the agent). */
  loading?: boolean;
}

/**
 * Unnumbered celebration screen reused for every "you did it" beat (setup
 * complete, all set). Big check, one line of reassurance, one forward CTA.
 * Visual polish (the "successy" treatment) is layered on in a later chunk; this
 * is the shared shell so every success reads the same.
 */
export function SuccessMission({
  title,
  body,
  ctaLabel,
  onContinue,
  loading,
}: SuccessMissionProps) {
  return (
    <SetupCard
      title={title}
      onNext={onContinue}
      nextLabel={ctaLabel}
      nextLoading={loading}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-8" />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
    </SetupCard>
  );
}
