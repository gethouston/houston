import { z } from "zod";

const missionSchema = z.object({ id: z.string(), title: z.string() }).strict();
export const missionAudienceSchema = z.union([
  z.object({ everyone: z.literal(true) }).strict(),
  z.object({ user_ids: z.array(z.string()).max(512) }).strict(),
]);
const common = {
  v: z.literal(1),
  conversation_id: z.string(),
  mission: missionSchema.nullable(),
};
export const pushReportSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("turn_settled"),
      turn_id: z.string(),
      reason: z.enum([
        "finished",
        "question",
        "signin",
        "connect",
        "credential",
        "hands_on",
        "error",
      ]),
      question_count: z.number().int().nonnegative(),
      audience: missionAudienceSchema,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("mentioned"),
      event_key: z.string(),
      user_ids: z.array(z.string()).max(32),
    })
    .strict(),
]);

export type PushReport = z.infer<typeof pushReportSchema>;

/** Keep the ellipsis within the gateway's 200-code-point title limit. */
export function pushMissionTitle(title: string): string {
  const points = Array.from(title);
  return points.length <= 200 ? title : `${points.slice(0, 199).join("")}…`;
}
