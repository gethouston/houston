import { uniqueAgentName } from "../../../lib/agent-name.ts";
import type { AgentRoleContext } from "../../../lib/agent-role-context.ts";
import { rosterUnsaved } from "./team-roster-edit.ts";

export type HireFailure = "nameTaken" | "failed";

export type RosterStatus =
  | { kind: "joining" }
  | { kind: "hired"; id: string }
  | { kind: "failed"; reason: HireFailure };

export interface RosterIdentity {
  name: string;
  color: string | undefined;
  brief: AgentRoleContext;
}

export interface RosterMember extends RosterIdentity {
  key: string;
  status: RosterStatus;
  saved: RosterIdentity;
  saveFailed: boolean;
}

export type RosterSettlement =
  | { kind: "hired"; id: string; name: string }
  | { kind: "failed"; reason: HireFailure };

export function rosterJoin(
  members: readonly RosterMember[],
  entry: Omit<RosterMember, "status" | "saved" | "saveFailed">,
): RosterMember[] {
  const saved = { name: entry.name, color: entry.color, brief: entry.brief };
  const status: RosterStatus = { kind: "joining" };
  return [...members, { ...entry, saved, saveFailed: false, status }];
}

export function rosterSettle(
  members: readonly RosterMember[],
  key: string,
  settlement: RosterSettlement,
): RosterMember[] {
  return members.map((member) => {
    if (member.key !== key || member.status.kind !== "joining") return member;
    if (settlement.kind === "failed") {
      return { ...member, status: settlement };
    }
    const renamed = member.name !== member.saved.name;
    return {
      ...member,
      name: renamed ? member.name : settlement.name,
      saved: { ...member.saved, name: settlement.name },
      status: { kind: "hired", id: settlement.id },
    };
  });
}

export function rosterRetry(
  members: readonly RosterMember[],
  key: string,
  takenNames: readonly string[],
): { members: RosterMember[]; retried: RosterMember } | null {
  const target = members.find((member) => member.key === key);
  if (target?.status.kind !== "failed") return null;
  const others = members
    .filter((member) => member.key !== key)
    .map((member) => member.name);
  const name =
    target.status.reason === "nameTaken"
      ? uniqueAgentName(target.name, [...takenNames, ...others, target.name])
      : target.name;
  const retried: RosterMember = {
    ...target,
    name,
    saved: { name, color: target.color, brief: target.brief },
    status: { kind: "joining" },
  };
  return {
    members: members.map((member) => (member.key === key ? retried : member)),
    retried,
  };
}

export function rosterRemove(
  members: readonly RosterMember[],
  key: string,
): RosterMember[] {
  return members.filter(
    (member) => member.key !== key || member.status.kind !== "failed",
  );
}

export type TeamFinishState =
  | "empty"
  | "waiting"
  | "failed"
  | "unsaved"
  | "ready";

export function teamFinishState(
  members: readonly RosterMember[],
  earlierHires = 0,
): TeamFinishState {
  const saving = (member: RosterMember) =>
    !member.saveFailed && rosterUnsaved(member) !== null;
  if (
    members.some((member) => member.status.kind === "joining" || saving(member))
  ) {
    return "waiting";
  }
  if (members.some((member) => member.status.kind === "failed")) {
    return "failed";
  }
  if (members.some((member) => member.saveFailed)) return "unsaved";
  return members.length + earlierHires > 0 ? "ready" : "empty";
}

export function finishPressable(state: TeamFinishState): boolean {
  return state === "waiting" || state === "unsaved" || state === "ready";
}

export function finishStep(
  state: TeamFinishState,
): "wait" | "cancel" | "finish" {
  if (state === "waiting") return "wait";
  return state === "ready" ? "finish" : "cancel";
}
