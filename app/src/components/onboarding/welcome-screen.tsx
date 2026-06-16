import { HoustonLogo } from "../shell/experience-card";
import { SetupCard } from "./setup-card";

interface WelcomeScreenProps {
  title: string;
  tagline: string;
  stepsTitle: string;
  steps: string[];
  startLabel: string;
  onStart: () => void;
}

/**
 * First screen of setup. The Houston hero — logo, welcome, and a preview of
 * the few steps ahead — rendered in the same `SetupCard` frame as every other
 * setup screen so the whole flow reads as one coherent thing. No skip: setup
 * is mandatory at the entry point.
 */
export function WelcomeScreen({
  title,
  tagline,
  stepsTitle,
  steps,
  startLabel,
  onStart,
}: WelcomeScreenProps) {
  return (
    <SetupCard
      icon={<HoustonLogo size={40} />}
      title={title}
      subtitle={tagline}
      onNext={onStart}
      nextLabel={startLabel}
    >
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
    </SetupCard>
  );
}
