import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { normalizeLocale } from "../../../lib/locale";
import { queueGoalHandoff } from "../../../lib/manager-onboarding/goal-handoff";
import type { HandoffAbout } from "../../../lib/manager-onboarding/handoff-prompt";
import type { ManagerReach } from "../../../lib/manager-onboarding/script";
import { useAgentStore } from "../../../stores/agents";
import { useManagerHandoffStore } from "../../../stores/manager-handoff";

export function useGoalHandoff({
  goal,
  about,
  reach,
  finish,
}: {
  goal: string | null;
  about: HandoffAbout;
  reach: ManagerReach | null;
  finish: (then?: () => void) => void;
}): () => void {
  const { i18n } = useTranslation();
  const started = useRef(false);
  return () => {
    const agents = useAgentStore.getState().agents;
    queueGoalHandoff(
      started,
      {
        goal,
        about,
        reach,
        team: agents.map(({ name, role }) => ({ name, role })),
        colors: agents.map((agent) => agent.color),
        locale: normalizeLocale(i18n.resolvedLanguage) ?? "en",
      },
      finish,
      (handoff) => useManagerHandoffStore.getState().handOff(handoff),
    );
  };
}
