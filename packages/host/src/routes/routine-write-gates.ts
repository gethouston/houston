import {
  canonicalProviderId,
  isValidTriggerBinding,
  scheduleFloorAllows,
} from "@houston/domain";
import {
  PLAN_MIN_INTERVAL,
  type PlanMinIntervalRefusal,
} from "@houston/protocol";
import { hostProvider } from "../providers";

/**
 * The gates a routine write passes before it is persisted (routine-write.ts).
 * Each returns the plain-language reason the caller relays, or null.
 */

/**
 * The rejection a routine write earns when it carries a `trigger` binding on a
 * deployment with no trigger backend: the automation could never wake, so we
 * refuse it up front rather than persist a dead routine. Written as a sentence
 * the agent can relay verbatim to a non-technical user (no jargon).
 */
export const NO_TRIGGER_BACKEND_WRITE_ERROR =
  "Event triggers are not available here. Give this automation a schedule instead.";

/**
 * A routine has EXACTLY ONE wake mechanism: a cron `schedule` or an event
 * `trigger`. Reject "both" or "neither" (normalizeRoutines drops such an entry
 * on the next read, which would silently lose the write) and a malformed trigger
 * binding, so the caller learns immediately. Returns the reason, else null.
 */
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

/**
 * Reject a provider pin naming a provider this host has never heard of —
 * otherwise the typo saves and every fired run errors. Validated through the
 * SAME canonical mapping the fire path uses (routinePin), so a Rust-era alias
 * ("claude", "codex") that still lives in a migrated routines.json round-trips
 * through an edit without a spurious rejection. Explicit model writes use
 * routine-model.ts and the picker's catalog. Returns the reason, else null.
 */
export const providerPinError = (
  body: Record<string, unknown>,
): string | null => {
  if (typeof body.provider !== "string" || !body.provider) return null;
  const canonical = canonicalProviderId(body.provider);
  return canonical && hostProvider(canonical)
    ? null
    : `unknown provider: ${body.provider}`;
};

/**
 * The refusal a routine with `schedule` earns under `floor` (the writer's plan
 * limit), else null: the protocol's `PlanMinIntervalRefusal`, which the client
 * reads with the protocol's own parser (pinned by
 * plan-floor-refusal-contract.test.ts). `error` is relayed to the agent
 * (save-routine.ts keeps the first 300 chars of the body, so it comes first
 * and stays short), and names neither the plan nor a cron: the agent speaks
 * to a non-technical person. A routine without a cron (an event trigger) has no
 * cadence to judge. The rule is the app editor's own (`scheduleFloorAllows`),
 * so the agent and the person are held to one line. `kept` = the write left
 * an existing schedule as it was (a wording edit of an old fast routine): the
 * refusal then says the schedule itself has to move first.
 */
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
