/**
 * The routine screen's Model section body (PRODUCT-1475): the resolved
 * provider + model as a picker, whether that account actually works, and — when
 * the routine carries no pin — the quiet line saying it follows the agent.
 *
 * The health claim is scoped: `/providers` answers for the VIEWER's credential
 * scope while a fired routine runs on its CREATOR's, so a teammate's routine
 * gets a plain sentence about whose account runs it instead of a badge derived
 * from the wrong one. Saving and enabling stay allowed either way — this row
 * informs, it never blocks.
 */

import type { Routine } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { useRoutineModelResolution } from "../../hooks/use-routine-model-resolution";
import { useRoutineProviderHealth } from "../../hooks/use-routine-provider-health";
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
          {t("details.health.runsAsCreator")}
        </p>
      )}
    </div>
  );
}
