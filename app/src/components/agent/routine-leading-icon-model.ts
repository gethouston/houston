import type { Routine } from "@houston/engine-adapter";

export type RoutineLeadingIcon =
  | { kind: "schedule" }
  | { kind: "webhook" }
  | { kind: "composio"; toolkit: string };

export function routineLeadingIcon(routine: Routine): RoutineLeadingIcon {
  const trigger = routine.trigger;
  if (!trigger) return { kind: "schedule" };
  if (trigger.kind === "webhook") return { kind: "webhook" };
  return { kind: "composio", toolkit: trigger.toolkit };
}
