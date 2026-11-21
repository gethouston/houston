import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveStartedMissionAgent } from "../../../hooks/started-mission-target";
import type {
  GoalProgress,
  GoalStaff,
} from "../../../lib/manager-onboarding/goal-progress";
import type { Agent } from "../../../lib/types";
import { useAgentStore } from "../../../stores/agents";
import { CARD_ACTION_CLASS } from "./card-actions";
import { GoalStep, type GoalStepState } from "./onboarding-goal-step";

interface Step {
  state: GoalStepState;
  label: string;
}

function staffAgent(
  staff: GoalStaff | null,
  agents: readonly Agent[],
): Agent | undefined {
  if (staff === null) return undefined;
  const key = staff.kind === "hired" ? staff.name : staff.agent;
  return resolveStartedMissionAgent(key, agents);
}

function staffName(staff: GoalStaff, agent: Agent | undefined): string {
  return agent?.name ?? (staff.kind === "hired" ? staff.name : staff.agent);
}

export function OnboardingGoalCard({
  goal,
  progress,
  onOpen,
  onRetry,
}: {
  goal: string;
  progress: GoalProgress;
  onOpen: (agent: Agent, missionId: string) => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation(["assistant", "common"]);
  const agents = useAgentStore((s) => s.agents);
  const staff = progress.phase === "staffing" ? null : progress.staff;
  const agent = staffAgent(staff, agents);
  const name = staff ? staffName(staff, agent) : "";
  const failed = progress.phase === "failed";

  const staffing: Step = (() => {
    if (staff?.kind === "hired")
      return { state: "done", label: t("onboarding.goalCard.hired", { name }) };
    if (staff?.kind === "picked")
      return {
        state: "done",
        label: t("onboarding.goalCard.picked", { name }),
      };
    if (progress.phase === "staffing" && progress.hiring)
      return {
        state: "active",
        label: t("onboarding.goalCard.hiring", { name: progress.hiring }),
      };
    return {
      state: failed ? "failed" : "active",
      label: t("onboarding.goalCard.find"),
    };
  })();
  const assigning: Step = (() => {
    if (progress.phase === "started")
      return { state: "done", label: t("onboarding.goalCard.assigned") };
    if (progress.phase === "assigning")
      return { state: "active", label: t("onboarding.goalCard.assigning") };
    return {
      state: failed && staff ? "failed" : "waiting",
      label: t("onboarding.goalCard.assign"),
    };
  })();
  const working: Step =
    progress.phase === "started"
      ? { state: "done", label: t("onboarding.goalCard.working", { name }) }
      : { state: "waiting", label: t("onboarding.goalCard.work") };

  return (
    <section
      data-testid="onboarding-goal-card"
      data-phase={progress.phase}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-line/60 bg-input p-3 md:max-w-md"
    >
      <header className="flex flex-col gap-0.5 px-1">
        <p className="text-sm font-medium text-ink">
          {t("onboarding.goalCard.title")}
        </p>
        <p className="line-clamp-2 text-xs text-ink-muted">
          {t("onboarding.goalCard.goal", { goal })}
        </p>
      </header>
      <ol className="flex flex-col gap-2 px-1" aria-live="polite">
        {[staffing, assigning, working].map((step) => (
          <GoalStep key={step.label} state={step.state} label={step.label} />
        ))}
      </ol>
      {progress.phase === "started" ? (
        <div className="flex flex-col gap-2 border-t border-line/60 px-1 pt-3">
          {agent ? (
            <Button
              type="button"
              className={CARD_ACTION_CLASS}
              onClick={() => onOpen(agent, progress.mission.id)}
            >
              <HoustonAvatar
                color={resolveAgentColor(agent.color)}
                diameter={20}
              />
              {t("onboarding.goalCard.open", { name: agent.name })}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
          <p className="text-xs text-ink-muted">
            {t("onboarding.goalCard.tip")}
          </p>
        </div>
      ) : null}
      {progress.phase === "failed" ? (
        <div className="flex flex-col gap-2 border-t border-line/60 px-1 pt-3 md:flex-row md:items-center">
          <p role="alert" className="flex-1 text-sm text-ink">
            {progress.reason ?? t("onboarding.goalCard.failed")}
          </p>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              className={CARD_ACTION_CLASS}
              onClick={onRetry}
            >
              {t("common:actions.tryAgain")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
