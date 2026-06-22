import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Check, LayoutGrid, Mail, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import confetti from "canvas-confetti";
import { cn } from "@houston-ai/core";

import { HoustonLogo } from "../shell/experience-card";
import { SetupCard } from "./setup-card";

export type Milestone = "ai" | "apps" | "agent" | "email";

const ICON: Record<Milestone, LucideIcon> = {
  ai: Sparkles,
  apps: LayoutGrid,
  agent: Bot,
  email: Mail,
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A few overlapping bursts for the "confetti like crazy" payoff. */
function fireConfetti() {
  if (prefersReducedMotion()) return;
  const base = { startVelocity: 45, ticks: 220, zIndex: 9999, scalar: 0.9 };
  confetti({ ...base, particleCount: 140, spread: 80, origin: { x: 0.5, y: 0.55 } });
  confetti({ ...base, particleCount: 70, spread: 60, angle: 60, origin: { x: 0, y: 0.7 } });
  confetti({ ...base, particleCount: 70, spread: 60, angle: 120, origin: { x: 1, y: 0.7 } });
}

interface SetupProgressProps {
  title: string;
  message: string;
  /** Milestones completed so far (rendered checked). */
  done: Milestone[];
  /** The milestone that just flipped to done — animates + fires confetti. Omit
   *  on the plain intro so it stays calm. */
  justCompleted?: Milestone;
  ctaLabel: string;
  onContinue: () => void;
}

/**
 * The single screen behind the intro AND every milestone celebration. It shows
 * the Houston mark, a title + message, and the four-milestone checklist grouped
 * Setup vs Onboarding — items the user has finished animate to a check. When a
 * milestone just completed, confetti rains. One component so the journey reads
 * as continuous progress; monochrome per the design system (confetti aside).
 */
export function SetupProgress({
  title,
  message,
  done,
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
    apps: t("tutorial.missions.intro.steps.apps"),
    agent: t("tutorial.missions.intro.steps.agent"),
    email: t("tutorial.missions.intro.steps.email"),
  };
  const sections: { name: string; items: Milestone[] }[] = [
    { name: t("tutorial.sections.setup"), items: ["ai", "apps"] },
    { name: t("tutorial.sections.onboarding"), items: ["agent", "email"] },
  ];

  return (
    <SetupCard onNext={onContinue} nextLabel={ctaLabel}>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <HoustonLogo size={52} />
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="max-w-md text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-4">
          {sections.map((sec) => (
            <div key={sec.name} className="flex flex-col gap-2">
              <p className="px-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {sec.name}
              </p>
              {sec.items.map((m) => {
                const isDone = doneSet.has(m);
                const Icon = ICON[m];
                return (
                  <div
                    key={m}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
                      isDone ? "bg-secondary" : "bg-secondary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        isDone
                          ? "bg-foreground text-background"
                          : "bg-background text-muted-foreground",
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
          ))}
        </div>
      </div>
    </SetupCard>
  );
}
