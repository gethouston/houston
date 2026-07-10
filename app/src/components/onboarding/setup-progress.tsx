import { cn } from "@houston-ai/core";
import confetti from "canvas-confetti";
import type { LucideIcon } from "lucide-react";
import { Check, Mail, Send, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "../shell/experience-card";
import { SetupCard } from "./setup-card";

export type Milestone = "ai" | "email" | "send";

// The full flat plan — first-run is a single flow, not two phases. The final
// "send your first email" step (`send`) has no standalone celebration screen
// (its payoff is the `finished` screen), so it never gets its own "done"
// milestone; it simply renders unchecked as the upcoming step. Which of these
// are actually shown is capability-driven and passed in via `items` (a
// no-integrations deployment shows only `ai`), so this constant is just the
// default full list.
const MILESTONES: Milestone[] = ["ai", "email", "send"];

const ICON: Record<Milestone, LucideIcon> = {
  ai: Sparkles,
  email: Mail,
  send: Send,
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A few overlapping bursts for the "confetti like crazy" payoff. */
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

interface SetupProgressProps {
  title: string;
  message: string;
  /** Milestones completed so far, rendered checked. */
  done: Milestone[];
  /** The visible plan for this deployment, in order. The orchestrator computes
   *  it from capabilities (all three normally, just `["ai"]` where integrations
   *  aren't served) so the plan never lists steps that will never happen.
   *  Defaults to the full list. */
  items?: Milestone[];
  /** The milestone that just flipped to done — animates + fires confetti. Omit
   *  on the plain overview screens so they stay calm. */
  justCompleted?: Milestone;
  ctaLabel: string;
  onContinue: () => void;
}

/**
 * The single screen behind the intro AND every milestone celebration. It shows
 * the Houston mark, a title + message, and the flat milestone checklist — items
 * the user has finished animate to a check. When a milestone just completed,
 * confetti rains. One component so the journey reads as continuous progress;
 * monochrome per the design system (confetti aside).
 */
export function SetupProgress({
  title,
  message,
  done,
  items = MILESTONES,
  justCompleted,
  ctaLabel,
  onContinue,
}: SetupProgressProps) {
  const { t } = useTranslation("setup");

  useEffect(() => {
    if (justCompleted) fireConfetti();
  }, [justCompleted]);

  const doneSet = new Set(done);
  const label: Record<Milestone, string> = {
    ai: t("tutorial.missions.intro.steps.ai"),
    email: t("tutorial.missions.intro.steps.email"),
    send: t("tutorial.missions.intro.steps.send"),
  };

  return (
    <SetupCard onSpace onNext={onContinue} nextLabel={ctaLabel}>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <HoustonLogo size={52} />
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="max-w-md text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        {/* A plain list, not a stack of boxed cards — these rows are pure
            display (what's ahead / what's done), never clickable, so they
            must not read as buttons. */}
        <div className="flex w-full max-w-sm flex-col gap-3">
          {items.map((m) => {
            const isDone = doneSet.has(m);
            const Icon = ICON[m];
            return (
              <div key={m} className="flex items-center gap-3 text-left">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isDone
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground",
                    m === justCompleted && "success-pop",
                  )}
                >
                  {isDone ? (
                    <Check className="size-4" strokeWidth={2.5} />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <span
                  className={cn(
                    "flex-1 text-sm font-medium",
                    isDone ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label[m]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SetupCard>
  );
}
