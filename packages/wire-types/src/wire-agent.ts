import { z } from "zod";

export const WireAgentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  createdAt: z.number(),
  color: z.string().optional(),
  role: z.string().optional(),
  timezone: z.string().optional(),
  dir: z.string().optional(),
  assigned: z.boolean().optional(),
  assignedUserIds: z.array(z.string()).optional(),
  access: z.enum(["manager", "user"]).optional(),
  assignments: z
    .array(
      z.object({
        userId: z.string(),
        access: z.enum(["manager", "user"]),
      }),
    )
    .optional(),
});
export type WireAgent = z.infer<typeof WireAgentSchema>;
