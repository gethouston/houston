import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, Sparkles } from "lucide-react";
import { useRoutines, useSkills } from "../../hooks/queries";
import { ONBOARDING_SKILL_SLUG } from "./onboarding-skill";
import { SkillCard } from "../skill-card";
import { MissionDoneScreen } from "./mission-done-screen";
import type { Agent } from "../../lib/types";

interface FrameLabels {
  brandLabel: string;
  counterLabel: string;
  upNextLabel: string;
}

interface SummaryScreenProps {
  frame: FrameLabels;
  agent: Agent;
  assistantColor: string;
  onContinue: () => void;
}

function formatCronTime(schedule: string): string | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h] = parts;
  const min = Number.parseInt(m, 10);
  const hr = Number.parseInt(h, 10);
  if (!Number.isFinite(min) || !Number.isFinite(hr)) return null;
  if (hr < 0 || hr > 23 || min < 0 || min > 59) return null;
  return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * "Meet your fully-equipped assistant" — the final celebratory screen.
 * Shows the assistant's identity (avatar + name handled by
 * `MissionDoneScreen`) plus the Skill and Routine the user just set up,
 * so the moment they cross into the workspace shell they remember
 * exactly what they built.
 *
 * Data is read live from `useSkills` / `useRoutines` so the cards match
 * what the user will see in their Skills / Routines tabs. We identify
 * the onboarding pair by the shared `plan-my-working-day` slug
 * (skill `name`, and the routine's `prompt` references the slug
 * literally — both directives enforce this).
 */
export function SummaryScreen({
  frame,
  agent,
  assistantColor,
  onContinue,
}: SummaryScreenProps) {
  const { t } = useTranslation("setup");
  const agentPath = agent.folderPath;
  const { data: skills } = useSkills(agentPath);
  const { data: routines } = useRoutines(agentPath);

  const onboardingSkill = useMemo(() => {
    return skills?.find((s) => s.name === ONBOARDING_SKILL_SLUG) ?? null;
  }, [skills]);

  const onboardingRoutine = useMemo(() => {
    if (!routines || routines.length === 0) return null;
    const skillBound = [...routines]
      .reverse()
      .find((r) => r.prompt?.includes(ONBOARDING_SKILL_SLUG));
    if (skillBound) return skillBound;
    return routines[routines.length - 1];
  }, [routines]);

  return (
    <MissionDoneScreen
      brandLabel={frame.brandLabel}
      assistantName={agent.name}
      assistantColor={assistantColor}
      title={t("setup:tutorial.missions.summary.title")}
      subtitle={t("setup:tutorial.missions.summary.body")}
      continueLabel={t("setup:tutorial.missions.summary.continueChip")}
      onContinue={onContinue}
    >
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden />
            <span>{t("setup:tutorial.missions.summary.skillCardTitle")}</span>
          </div>
          {onboardingSkill ? (
            <SkillCard
              image={onboardingSkill.image ?? "spiral-calendar"}
              title={onboardingSkill.name}
              description={onboardingSkill.description}
              onClick={() => {}}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-muted-foreground">
              {t("setup:tutorial.missions.summary.noSkill")}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Calendar className="size-3.5" aria-hidden />
            <span>{t("setup:tutorial.missions.summary.routineCardTitle")}</span>
          </div>
          {onboardingRoutine ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-secondary p-4">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-foreground">
                  {onboardingRoutine.name}
                </p>
                {onboardingRoutine.description && (
                  <p className="text-xs text-muted-foreground">
                    {onboardingRoutine.description}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-background p-3">
                <p className="text-lg font-normal">
                  {(() => {
                    const time = formatCronTime(onboardingRoutine.schedule);
                    return time
                      ? t(
                          "setup:tutorial.missions.routine.done.everyWeekdayAt",
                          { time },
                        )
                      : onboardingRoutine.schedule;
                  })()}
                </p>
                {onboardingSkill && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("setup:tutorial.missions.routine.done.runsSkill", {
                      skill: onboardingSkill.name,
                    })}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-muted-foreground">
              {t("setup:tutorial.missions.summary.noRoutine")}
            </div>
          )}
        </section>
      </div>
    </MissionDoneScreen>
  );
}
