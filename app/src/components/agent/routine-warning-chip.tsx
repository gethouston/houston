import type { Routine } from "@houston/engine-adapter";
import {
  formatLocalDateTime,
  routinePauseNotice,
  routineSnoozeNotice,
} from "@houston/sdk";
import { useTranslation } from "react-i18next";
import { useRoutineModelResolution } from "../../hooks/use-routine-model-resolution";
import { useRoutineProviderHealth } from "../../hooks/use-routine-provider-health";
import { routineHealthBlocksRun } from "../../lib/routine-provider-health";
import type { Agent } from "../../lib/types";
import { RoutineProviderHealthBadge } from "./routine-provider-health-badge";

export function RoutineWarningChip({
  agent,
  routine,
}: {
  agent: Agent;
  routine: Routine;
}) {
  const { t, i18n } = useTranslation("routines");
  const { provider } = useRoutineModelResolution(agent, routine);
  const { showBadge, health } = useRoutineProviderHealth(
    routine.created_by,
    provider,
  );
  const held = routineSnoozeNotice(routine);
  if (routinePauseNotice(routine) || held)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-warning"
        />
        {held
          ? t("details.snooze.chip", {
              time: formatLocalDateTime(held.until, i18n.language),
            })
          : t("details.autoPause.chip")}
      </span>
    );
  if (!showBadge || !routineHealthBlocksRun(health)) return null;
  return (
    <RoutineProviderHealthBadge health={health} provider={provider} compact />
  );
}
