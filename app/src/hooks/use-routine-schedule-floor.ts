import {
  type RoutineScheduleFloor,
  routineScheduleFloor,
  scheduleFloorRule,
} from "@houston/sdk";
import { useMemo } from "react";
import { useActiveOrgBilling } from "./queries/use-billing";

/**
 * The schedule floor for any save in the active org (SDK
 * `routineScheduleFloor`: the org's tier decides, since the gateway judges
 * every fire against the org the routine lives in), bound to the SDK's one rule
 * (`scheduleFloorRule`). Every schedule editor mount AND its save backstop
 * read it from here: the editor offers only what `allows` accepts and the
 * backstop asks the same `allows`, so the two always agree. Memoized on the
 * minutes, so the editor's scan of the counts it offers runs once per org.
 */
export function useRoutineScheduleFloor(): RoutineScheduleFloor | undefined {
  const { billing } = useActiveOrgBilling();
  const minutes = routineScheduleFloor(billing);
  return useMemo(
    () => (minutes === undefined ? undefined : scheduleFloorRule(minutes)),
    [minutes],
  );
}
