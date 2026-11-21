import type { MissionStartedBy } from "@houston/sdk/mission-started-by";

export interface MissionOriginLabels {
  routine: string;
  setup: string;
  houston: string;
  api: string;
  employee: string;
  employeeNamed: (name: string) => string;
}

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
      const unhandled: never = startedBy;
      return unhandled;
    }
  }
}

export function missionCardTags(originTag?: string): string[] | undefined {
  return originTag ? [originTag] : undefined;
}
