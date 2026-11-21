import {
  type RoutineScheduleFloor,
  routineScheduleFloor,
  scheduleFloorRule,
} from "@houston/sdk";
import { useMemo } from "react";
import { useActiveOrgBilling } from "./queries/use-billing";

export function useRoutineScheduleFloor(): RoutineScheduleFloor | undefined {
  const { billing } = useActiveOrgBilling();
  const minutes = routineScheduleFloor(billing);
  return useMemo(
    () => (minutes === undefined ? undefined : scheduleFloorRule(minutes)),
    [minutes],
  );
}
