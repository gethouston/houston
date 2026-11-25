import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { durationMs, easing } from "@houston/design-tokens";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  type LucideIcon,
  Plug,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ManagerReach } from "../../../lib/manager-onboarding/script-types";
import type { Agent } from "../../../lib/types";
import { useAgentStore } from "../../../stores/agents";

type Ability = "missions" | "hire" | "invite" | "connect";

const ABILITY_ICON: Record<Ability, LucideIcon> = {
  missions: Target,
  hire: UserPlus,
  invite: Users,
  connect: Plug,
};

function abilities(reach: ManagerReach): Ability[] {
  return [
    "missions",
    "hire",
    ...(reach.invite ? (["invite"] as const) : []),
    ...(reach.connect ? (["connect"] as const) : []),
  ];
}

/**
 * The close of first run, drawn as one card: the team, each AI Employee a row
 * that opens them (so it is plain the person can give them work directly),
 * then what the manager does, as chips. The roster is live: someone hired
 * later joins it. Without `onOpen` (the scripted conversation, about to hand
 * over to the real chat) the rows are only shown.
 */
export function OnboardingTeamCard({
  reach,
  onOpen,
}: {
  reach: ManagerReach | null;
  onOpen?: (agent: Agent) => void;
}) {
  const { t } = useTranslation("assistant");
  const agents = useAgentStore((s) => s.agents);
  return (
    <section
      data-testid="onboarding-team-card"
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-line/60 bg-input p-3 md:max-w-md"
    >
      <header className="flex flex-col gap-0.5 px-1">
        <p className="text-sm font-medium text-ink text-balance">
          {t("onboarding.say.closingReady")}
        </p>
        <p className="text-xs text-ink-muted">
          {t("onboarding.say.closingEmployees")}
        </p>
      </header>
      {agents.length > 0 ? (
        <ul className="flex flex-col">
          {agents.map((agent, index) => (
            <li key={agent.id}>
              <TeamRow
                agent={agent}
                beckon={index === 0 && onOpen !== undefined}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {reach ? (
        <div className="flex flex-col gap-2 border-t border-line/60 px-1 pt-3">
          <p className="text-xs text-ink-muted">
            {t("onboarding.teamCard.managerTitle")}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {abilities(reach).map((ability) => {
              const Icon = ABILITY_ICON[ability];
              return (
                <li
                  key={ability}
                  className="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-xs text-chip-text"
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {t(`onboarding.teamCard.abilities.${ability}`)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** One AI Employee. `beckon`: the first face pulses once, so the rows read
 *  as something to open. */
function TeamRow({
  agent,
  beckon,
  onOpen,
}: {
  agent: Agent;
  beckon: boolean;
  onOpen?: (agent: Agent) => void;
}) {
  const { t } = useTranslation("assistant");
  const reduce = useReducedMotion() ?? false;
  const face = (
    <motion.span
      className="shrink-0"
      initial={false}
      animate={beckon && !reduce ? { scale: [1, 1.12, 1] } : undefined}
      transition={{
        delay: durationMs.elegant / 1000,
        duration: durationMs.common / 1000,
        ease: easing.entrance,
      }}
    >
      <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={32} />
    </motion.span>
  );
  const words = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-ink">{agent.name}</span>
      {agent.role ? (
        <span className="block truncate text-xs text-ink-muted">
          {agent.role}
        </span>
      ) : null}
    </span>
  );
  if (!onOpen)
    return (
      <div className="flex min-h-11 items-center gap-3 px-1 py-1.5">
        {face}
        {words}
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => onOpen(agent)}
      aria-label={t("onboarding.goalCard.open", { name: agent.name })}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-focus/50 active:scale-[0.99]"
    >
      {face}
      {words}
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink">
        {t("onboarding.teamCard.open")}
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </span>
    </button>
  );
}
