/**
 * What removing a member would stop: the routines they created that run as
 * them. Apart from the roster calls in `http.ts` because it reads automations,
 * not membership; same transport, same gateway-only `/v1/org*` family, same
 * no-swallow rule (every non-2xx throws the module's {@link OrgHttpError}).
 */

import { type MemberRoutines, memberRoutinesSchema } from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";

export type {
  MemberRoutine,
  MemberRoutineKind,
  MemberRoutines,
} from "@houston/wire-types";

/**
 * Lists the routines someone set up that would stop if they were removed from
 * this space.
 *
 * A routine runs as the person who created it, on their own connected apps, so
 * removing them stops it and nothing hands it to anyone else. Only owners may
 * ask, and only about a current member. A malformed answer throws like a
 * failed one.
 * @param userId The person, by the user id getOrgPeople returns.
 * @assistant group:org
 */
export async function listMemberRoutines(
  scope: HttpScope,
  userId: string,
): Promise<MemberRoutines> {
  const res = await httpRequest(
    scope,
    `/v1/org/members/${encodeURIComponent(userId)}/routines`,
  );
  return memberRoutinesSchema.parse(await res.json());
}
