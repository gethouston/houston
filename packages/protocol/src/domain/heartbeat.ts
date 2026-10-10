// The daily heartbeat (the AI Manager's morning briefing): the person's
// settings, the host-owned record of the last run, and the wire shapes of the
// `/v1/heartbeat` family. One document per person, in the personal workspace.

import { z } from "zod";

/** A wall-clock time of day, `HH:MM` on a 24-hour clock. */
export const HEARTBEAT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const HeartbeatTimeSchema = z.string().regex(HEARTBEAT_TIME_PATTERN);

/** What the person chooses: whether the briefing runs, and from what time. */
export const HeartbeatSettingsSchema = z.object({
  enabled: z.boolean(),
  time: HeartbeatTimeSchema,
});
export type HeartbeatSettings = z.infer<typeof HeartbeatSettingsSchema>;

/** Features default ON: an absent document is a briefing at 08:00. */
export const DEFAULT_HEARTBEAT_SETTINGS: HeartbeatSettings = {
  enabled: true,
  time: "08:00",
};

/** `PUT /v1/heartbeat`'s body: either field alone, nothing else. */
export const HeartbeatSettingsPatchSchema = z
  .object({ enabled: z.boolean(), time: HeartbeatTimeSchema })
  .partial()
  .strict();
export type HeartbeatSettingsPatch = z.infer<
  typeof HeartbeatSettingsPatchSchema
>;

/**
 * How the last run ended. `delivered`: a briefing turn was accepted. `quiet`:
 * nothing needed the person, so no model call was made. `error`: the turn
 * could not start (no provider, quota...), retried the next day only.
 */
export const HeartbeatRunStatus = {
  Delivered: "delivered",
  Quiet: "quiet",
  Error: "error",
} as const;
export type HeartbeatRunStatus =
  (typeof HeartbeatRunStatus)[keyof typeof HeartbeatRunStatus];

const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const HeartbeatLastSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.enum([HeartbeatRunStatus.Delivered, HeartbeatRunStatus.Quiet]),
    /** The person's local date the run counted for, `YYYY-MM-DD`. */
    date: LocalDateSchema,
    at: z.string(),
  }),
  z.object({
    status: z.literal(HeartbeatRunStatus.Error),
    date: LocalDateSchema,
    at: z.string(),
    reason: z.string(),
  }),
]);
export type HeartbeatLast = z.infer<typeof HeartbeatLastSchema>;

/** `GET /v1/heartbeat`'s answer, and the stored document's shape. */
export const HeartbeatStateSchema = HeartbeatSettingsSchema.extend({
  last: HeartbeatLastSchema.nullable(),
});
export type HeartbeatState = z.infer<typeof HeartbeatStateSchema>;

/** `POST /v1/heartbeat/run`'s answer: a briefing went out, or nothing to say. */
export const HeartbeatRunResultSchema = z.object({
  status: z.enum([HeartbeatRunStatus.Delivered, HeartbeatRunStatus.Quiet]),
});
export type HeartbeatRunResult = z.infer<typeof HeartbeatRunResultSchema>;

/** The refusal codes the family answers with. */
export const HeartbeatRefusalCode = {
  /** 400: the body is not a valid partial settings object. */
  Invalid: "heartbeat_invalid",
  /** 409: the manager is mid-turn; ask again once it finishes. */
  TurnRunning: "turn_running",
  /** 422: the briefing turn could not start (no AI account connected, a
   *  usage limit...). Recorded as today's run; the reason rides `error`. */
  Failed: "heartbeat_failed",
  /** 501: a gateway fronts this engine and the gateway does not serve it yet. */
  GatewayOnly: "heartbeat_gateway_only",
  /** 501: this deployment has no manager to brief from. */
  Unavailable: "heartbeat_unavailable",
} as const;
export type HeartbeatRefusalCode =
  (typeof HeartbeatRefusalCode)[keyof typeof HeartbeatRefusalCode];
