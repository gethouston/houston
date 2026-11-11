import type { MissionStartedBy } from "@houston/sdk/mission-started-by";

/** The words each origin reads as, already translated by the caller. */
export interface MissionOriginLabels {
  routine: string;
  setup: string;
  houston: string;
  api: string;
  /** An AI Employee whose name the roster no longer knows. */
  employee: string;
  employeeNamed: (name: string) => string;
}

/**
 * The origin tag a mission wears on every surface (the active board, the
 * archive, the phone's task rows). WHO started it is the SDK's decision
 * (`missionStartedBy`); this only puts it into words. A person's own mission
 * wears none.
 */
export function missionOriginLabel(
  startedBy: MissionStartedBy,
  labels: MissionOriginLabels,
  employeeName?: string,
): string | undefined {
  switch (startedBy.kind) {
    case "person":
      return undefined;
    case "routine":
      return labels.routine;
    case "setup":
      return labels.setup;
    case "houston":
      return labels.houston;
    case "api":
      return labels.api;
    case "employee":
      return employeeName
        ? labels.employeeNamed(employeeName)
        : labels.employee;
    default: {
      // A new SDK origin fails the build here instead of reading as untagged.
      const unhandled: never = startedBy;
      return unhandled;
    }
  }
}

/** A board card's tag list: its origin tag alone, or none. */
export function missionCardTags(originTag?: string): string[] | undefined {
  return originTag ? [originTag] : undefined;
}
