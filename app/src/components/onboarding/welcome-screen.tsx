import { Button } from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";

interface WelcomeScreenProps {
  title: string;
  tagline: string;
  stepsTitle: string;
  steps: string[];
  startLabel: string;
  onStart: () => void;
  /**
   * Optional escape gate. Setup is mandatory at the entry point, so the
   * orchestrator no longer passes this and the skip affordance is not
   * rendered. Kept optional so the component stays reusable.
   */
  skipLabel?: string;
  onSkip?: () => void;
}

export function WelcomeScreen({
  title,
  tagline,
  stepsTitle,
  steps,
  startLabel,
  onStart,
  skipLabel,
  onSkip,
}: WelcomeScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <HoustonLogo size={56} />
        <h1 className="text-[28px] font-normal leading-tight">{title}</h1>
        <p className="text-base text-muted-foreground">{tagline}</p>
        <div className="w-full rounded-xl border border-black/5 bg-secondary/40 p-4 text-left">
          <p className="text-sm font-medium">{stepsTitle}</p>
          <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {steps.map((step, index) => (
              <li key={step} className="flex items-baseline gap-3">
                <span className="w-4 shrink-0 text-xs tabular-nums text-foreground/60">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button className="rounded-full px-6" onClick={onStart}>
            {startLabel}
          </Button>
          {onSkip && skipLabel && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {skipLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
