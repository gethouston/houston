import { z } from "zod";

/** The host/gateway agent record, before the adapter maps it for a surface. */
export const WireAgentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  createdAt: z.number(),
  /**
   * Rust-era legacy color, read by the host from the agent's
   * `.houston/agent.json` (local/self-host profiles only; the hosted gateway
   * omits it). A client's own color overlay outranks it — this only fills the
   * gap for agents whose color was picked before the engine cutover.
   */
  color: z.string().optional(),
  /** The role the agent's job description names (its `CLAUDE.md` `role`
   *  field), normalized. Absent when the description names none, and on a
   *  gateway whose agent has not published one yet. */
  role: z.string().optional(),
  /**
   * The zone the scheduler fires this employee's routines in. The server
   * validated it; it is not re-checked here because a device with older time
   * zone data (e.g. a WebKit that predates `Europe/Kyiv`) would otherwise
   * reject the whole agent list.
   */
  timezone: z.string().optional(),
  /** Absolute on-disk directory, present only when the host holds the files
   *  (local profile). Feeds the OS reveal/open commands. */
  dir: z.string().optional(),
  /** Teams v2: whether this agent is assigned to anyone at all. */
  assigned: z.boolean().optional(),
  /** Teams v2: the assignees' user ids, mirroring {@link assignments}. */
  assignedUserIds: z.array(z.string()).optional(),
  /** Teams v2: the caller's own effective access to this agent. */
  access: z.enum(["manager", "user"]).optional(),
  /** Teams v2: the full assignee list with per-person access. Served only to
   *  callers who may manage the agent (its owner, or a managing admin). */
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
