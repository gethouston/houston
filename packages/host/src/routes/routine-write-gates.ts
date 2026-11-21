import {
  canonicalProviderId,
  isValidTriggerBinding,
  scheduleFloorAllows,
} from "@houston/domain";
import {
  PLAN_MIN_INTERVAL,
  type PlanMinIntervalRefusal,
} from "@houston/protocol";
import { isKnownProvider } from "../providers";

export const NO_TRIGGER_BACKEND_WRITE_ERROR =
  "Event triggers are not available here. Give this automation a schedule instead.";

export const wakeMechanismError = (
  body: Record<string, unknown>,
): string | null => {
  const hasSchedule = typeof body.schedule === "string" && body.schedule !== "";
  const hasTrigger = body.trigger != null;
  if (hasSchedule === hasTrigger) {
    return "a routine needs exactly one of 'schedule' or 'trigger'";
  }
  if (hasTrigger && !isValidTriggerBinding(body.trigger)) {
    return "invalid 'trigger' binding";
  }
  return null;
};

export const providerPinError = (
  body: Record<string, unknown>,
): string | null => {
  if (typeof body.provider !== "string" || !body.provider) return null;
  const canonical = canonicalProviderId(body.provider);
  return canonical && isKnownProvider(canonical)
    ? null
    : `unknown provider: ${body.provider}`;
};

export function planFloorRefusal(
  schedule: unknown,
  floor: number | undefined,
  kept = false,
): PlanMinIntervalRefusal | null {
  if (floor === undefined || typeof schedule !== "string" || !schedule)
    return null;
  if (scheduleFloorAllows(schedule, floor)) return null;
  return {
    error: kept
      ? `This task already runs more often than this person's plan allows (at most once every ${floor} minutes), so nothing was saved. Move its schedule to every ${floor} minutes or slower before other changes can be saved; ask the person first.`
      : `This person's plan runs a scheduled task at most once every ${floor} minutes, so nothing was saved. Ask whether every ${floor} minutes or slower works, then save again; upgrading the plan removes this limit.`,
    code: PLAN_MIN_INTERVAL,
    minIntervalMinutes: floor,
  };
}
