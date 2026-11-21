import { isAgentSetupMode } from "@houston/domain/first-day-mode";
import type { MissionStarter } from "@houston/protocol";

export type MissionStartedBy =
  | { kind: "person" }
  | { kind: "routine" }
  | { kind: "setup" }
  | { kind: "houston" }
  | { kind: "api" }
  | { kind: "employee"; agentId?: string };

export interface MissionStartFacts {
  routine_id?: string | null;
  agent?: string | null;
  origin_session_key?: string | null;
  origin_agent?: string | null;
  started_by?: MissionStarter | null;
}

export function missionStartedBy(row: MissionStartFacts): MissionStartedBy {
  if (row.routine_id) return { kind: "routine" };
  if (isAgentSetupMode(row.agent)) return { kind: "setup" };
  if (row.started_by === "houston") return { kind: "houston" };
  if (row.started_by === "api") return { kind: "api" };
  if (row.started_by === "employee" || row.origin_session_key) {
    return row.origin_agent
      ? { kind: "employee", agentId: row.origin_agent }
      : { kind: "employee" };
  }
  return { kind: "person" };
}
