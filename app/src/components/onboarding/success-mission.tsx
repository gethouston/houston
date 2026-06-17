import { SetupCard } from "./setup-card";
import { SuccessCheck } from "./success-check";

interface SuccessMissionProps {
  title: string;
  body: string;
  ctaLabel: string;
  onContinue: () => void;
  /** Loading state while the CTA kicks off async work (e.g. creating the agent). */
  loading?: boolean;
}

/**
 * Celebration screen reused for every "you did it" beat (setup complete, all
 * set). A centered hero: the check pops in with a ring pulse behind it, a
 * confident headline, one line of reassurance, and the forward CTA in the
 * shared footer. Monochrome per the design system — the reward is the motion
 * and scale, not a decorative color. Title is rendered here (centered), so the
 * card's own top-left heading is left empty.
 */
export function SuccessMission({
  title,
  body,
  ctaLabel,
  onContinue,
  loading,
}: SuccessMissionProps) {
  return (
    <SetupCard onNext={onContinue} nextLabel={ctaLabel} nextLoading={loading}>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <SuccessCheck size="lg" ring />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">
            {title}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
    </SetupCard>
  );
}
