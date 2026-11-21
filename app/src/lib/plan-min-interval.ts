import { planMinIntervalRefusal } from "@houston/sdk/routines/plan-floor-quiet";
import { showPlanFloorToast } from "./plan-floor-toast";

export function surfacePlanMinInterval(err: unknown): boolean {
  const refusal = planMinIntervalRefusal(err);
  if (!refusal) return false;
  showPlanFloorToast(refusal.minIntervalMinutes);
  return true;
}
