import type { Routine } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import { useRoutineModelResolution } from "../../hooks/use-routine-model-resolution";
import { useRoutineProviderHealth } from "../../hooks/use-routine-provider-health";
import { providerName } from "../../lib/providers";
import type { Agent } from "../../lib/types";
import { RoutineModelSelector } from "./routine-model-selector";
import { RoutineProviderHealthBadge } from "./routine-provider-health-badge";

export function RoutineModelRow({
  agent,
  routine,
}: {
  agent: Agent;
  routine: Routine;
}) {
  const { t } = useTranslation("routines");
  const { provider, followsAgent } = useRoutineModelResolution(agent, routine);
  const { showBadge, health, runsAsCreator } = useRoutineProviderHealth(
    routine.created_by,
    provider,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <RoutineModelSelector agent={agent} routine={routine} bordered />
        {showBadge && (
          <RoutineProviderHealthBadge health={health} provider={provider} />
        )}
      </div>
      {followsAgent && (
        <p className="text-xs text-ink-muted">
          {t("details.model.followsAgent")}
        </p>
      )}
      {runsAsCreator && (
        <p className="text-xs text-ink-muted">
          {provider
            ? t("details.health.runsAsCreatorProvider", {
                provider: providerName(provider),
              })
            : t("details.health.runsAsCreator")}
        </p>
      )}
    </div>
  );
}
