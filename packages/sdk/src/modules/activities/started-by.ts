/**
 * WHO started a mission, as every surface labels it (PRODUCT-1928): the one
 * decision behind a board card's origin tag, the phone's mission rows and the
 * archive, so a mission can never read one way in one place and another way in
 * the next.
 *
 * Node-safe on purpose (`@houston/sdk/mission-started-by`): `node --test`
 * loads app modules that import it, so it pulls in nothing beyond the setup
 * sentinel and types.
 */

import { isAgentSetupMode } from "@houston/domain/first-day-mode";
import type { MissionStarter } from "@houston/protocol";

export type MissionStartedBy =
  | { kind: "person" }
  | { kind: "routine" }
  | { kind: "setup" }
  | { kind: "houston" }
  | { kind: "api" }
  /** `agentId` is the starting employee, when the host recorded it. */
  | { kind: "employee"; agentId?: string };

/**
 * The facts the decision reads, in the wire's snake_case, so a wire
 * `Activity`, a `ConversationEntry` and any app row built from them pass
 * unchanged.
 */
export interface MissionStartFacts {
  routine_id?: string | null;
  /** The mode field, which carries the setup task's sentinel. */
  agent?: string | null;
  origin_session_key?: string | null;
  origin_agent?: string | null;
  started_by?: MissionStarter | null;
}

/**
 * First match wins: a routine's run, then the setup task, then Houston, then
 * the API, then an AI Employee, else the person's own mission. A row with no
 * `started_by` but an `origin_session_key` predates the field and was started
 * by an agent,
 * so it stays an employee's: older Houston missions are never relabeled.
 */
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
