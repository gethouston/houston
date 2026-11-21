import { z } from "zod";

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
