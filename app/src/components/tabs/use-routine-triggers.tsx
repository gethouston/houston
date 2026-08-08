import type { Routine } from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useAgentTriggerStatus } from "../../hooks/queries/use-triggers";
import type { Agent } from "../../lib/types";
import { triggerBoundRoutineIds } from "./routine-trigger-maps";
import {
  type TriggerSurface,
  useTriggerStatusViewModel,
} from "./trigger-status-view-model";

/**
 * Wires the Automations tab's event-trigger surface (C9) for ONE agent: it owns
 * the status READ, and hands it to the shared view model
 * (`trigger-status-view-model.ts`) that turns it into exactly the trigger props
 * `RoutinesGrid` takes. The team's cross-agent list runs the same view model
 * behind its own fan-out, so the two surfaces cannot drift on what a trigger
 * row is allowed to claim.
 *
 * The read is gated on the ROUTINES, not on the `triggers` capability: a bound
 * routine's health must show even on a host that can never fire it (that host
 * 404s, the rows fall back to the unknown state and then time out). No trigger
 * routines -> no request.
 */
export function useRoutineTriggers(
  agent: Agent,
  routines: Routine[] | undefined,
): TriggerSurface {
  const triggerRoutineIds = useMemo(
    () => triggerBoundRoutineIds(routines),
    [routines],
  );

  const statusQuery = useAgentTriggerStatus(
    agent.id,
    triggerRoutineIds.length > 0,
    triggerRoutineIds,
  );

  // Nothing to re-key here: this list's rows ARE the agent's routines, so the
  // grid's row ids and the host's `routine_id`s are already the same space.
  // (The team's merged list is the surface that has to translate.)
  return useTriggerStatusViewModel(routines, statusQuery.data);
}
