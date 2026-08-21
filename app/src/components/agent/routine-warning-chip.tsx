/**
 * The compact "this one will fail" chip a routine row carries (PRODUCT-1475).
 *
 * A routine list is where a person notices a broken automation, so the warning
 * has to live on the ROW, not only inside the routine's screen. It renders only
 * for a routine whose resolved provider is confirmed unusable AND whose creator
 * is the viewer — the viewer's `/providers` answer says nothing about anyone
 * else's account (see `useRoutineProviderHealth`). Healthy and still-checking
 * rows render nothing: a list of chips saying "fine" is noise.
 *
 * A component rather than a plain function because it resolves the pair and
 * probes the provider through hooks; the grid's slot takes the rendered node.
 */

import type { Routine } from "@houston-ai/engine-client";
import { useRoutineModelResolution } from "../../hooks/use-routine-model-resolution";
import { useRoutineProviderHealth } from "../../hooks/use-routine-provider-health";
import { routineHealthBlocksRun } from "../../lib/routine-provider-health";
import type { Agent } from "../../lib/types";
import { RoutineProviderHealthBadge } from "./routine-provider-health-badge";

export function RoutineWarningChip({
  agent,
  routine,
}: {
  /** The routine's OWNING agent — a cross-agent list has one per row. */
  agent: Agent;
  routine: Routine;
}) {
  const { provider } = useRoutineModelResolution(agent, routine);
  const { showBadge, health } = useRoutineProviderHealth(
    routine.created_by,
    provider,
  );
  if (!showBadge || !routineHealthBlocksRun(health)) return null;
  return (
    <RoutineProviderHealthBadge health={health} provider={provider} compact />
  );
}
