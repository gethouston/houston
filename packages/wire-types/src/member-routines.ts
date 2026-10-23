import { z } from "zod";

/**
 * `GET /v1/org/members/{userId}/routines` (gateway only, owner only): the
 * routines a member created that removing them from the space would stop.
 *
 * A routine runs as the person who created it, on that person's own connected
 * apps, and the gateway refuses to run it once they are no longer a member.
 * Nothing moves it to someone else, so this is read before the removal is
 * confirmed. Only routines that run today are listed: one on an employee the
 * person can no longer use is already stopped. The person's own AI Manager is
 * never listed (it leaves with them and is private to them).
 *
 * `kind` is the wake source: `schedule` (a cron time) or `trigger` (an app
 * event or an incoming webhook). `name` is `""` when the gateway has no title
 * for the routine. A non-member answers `404`, a caller who is not an owner
 * `403`.
 */

export const MEMBER_ROUTINE_KINDS = ["schedule", "trigger"] as const;
export type MemberRoutineKind = (typeof MEMBER_ROUTINE_KINDS)[number];

export const memberRoutineSchema = z.object({
  routineId: z.string(),
  name: z.string(),
  agentSlug: z.string(),
  agentName: z.string(),
  kind: z.enum(MEMBER_ROUTINE_KINDS),
  enabled: z.boolean(),
});
export type MemberRoutine = z.infer<typeof memberRoutineSchema>;

export const memberRoutinesSchema = z.object({
  routines: z.array(memberRoutineSchema),
});
export type MemberRoutines = z.infer<typeof memberRoutinesSchema>;
