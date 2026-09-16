import { isExpectedAgentTeamError } from "../../lib/agent-team-errors.ts";

/**
 * What one press of "Create team" has left to do, and what it leaves behind.
 *
 * A server-backed team is TWO writes: the team itself, then each person picked
 * for it. Only the first of them makes something, so the two are held apart
 * here. Once the team exists this submission owns it for good — a second press
 * finishes adding people to THAT team and can never make a second one — and
 * the people it could not take are carried out as names rather than as a
 * rejection, because a team that exists is not a failed create.
 */

/** What the press has to do, given what this submission already made. */
export type CreateTeamAction =
  | { kind: "create" }
  | { kind: "resume"; teamId: string };

export function createTeamAction(createdId: string | null): CreateTeamAction {
  return createdId === null
    ? { kind: "create" }
    : { kind: "resume", teamId: createdId };
}

/** How the flow ends once the writes have settled. */
export interface CreateTeamSubmitOutcome {
  /** The team to land in, or null when there is none to land in. */
  land: { teamId: string } | null;
  /** The people the team could not take, or null when it took everyone. */
  toast: { names: readonly string[] } | null;
}

/**
 * Where the press leaves the user. You made a place, you land in it — the team
 * exists and the board is where the next step is obvious — and a person the
 * team could not take is something to say once the user is standing in it,
 * naming exactly who, so they can add them from the team's own Members list.
 */
export function createTeamSubmitOutcome({
  createdId,
  failedMembers,
}: {
  createdId: string | null;
  failedMembers: readonly string[];
}): CreateTeamSubmitOutcome {
  if (createdId === null) return { land: null, toast: null };
  return {
    land: { teamId: createdId },
    toast: failedMembers.length > 0 ? { names: failedMembers } : null,
  };
}

/** How a picked person is named in that copy: exactly as the picker named
 *  them, so the user reads back the rows they chose. */
export function teamMemberName(member: {
  userId: string;
  email?: string;
}): string {
  return member.email ?? member.userId;
}

/** One picked person the new team could not take. */
export interface FailedMemberAdd {
  /** Named as the picker named them — see {@link teamMemberName}. */
  name: string;
  /** The rejection itself, kept so the bugs among them can be reported. */
  error: unknown;
}

/** What the refusals owe: the ones we must SEE, and everyone to NAME. */
export interface MemberAddFallout {
  /** The rejections that are Houston bugs and must reach the reporting paths. */
  report: readonly unknown[];
  /** Everyone the team could not take, for the one summary toast. */
  names: readonly string[];
}

/**
 * Split a run of refused member adds into what we report and what the user
 * reads.
 *
 * An EXPECTED gateway state (the `agent-team-errors.ts` set: a non-owner adding
 * people, a stale team id, a space with no roster) is an ANSWER, not a Houston
 * bug, so it is named to the user and never reported — reporting it would file
 * a Sentry issue for the gateway working as designed. Everything else is a bug,
 * reported once, and its person is named alongside the rest: the user is owed
 * the same sentence either way, because either way the team did not take them.
 */
export function memberAddFallout(
  failures: readonly FailedMemberAdd[],
): MemberAddFallout {
  return {
    report: failures
      .filter(({ error }) => !isExpectedAgentTeamError(error))
      .map(({ error }) => error),
    names: failures.map(({ name }) => name),
  };
}
