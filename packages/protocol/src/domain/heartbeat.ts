import { z } from "zod";

export const HEARTBEAT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const HeartbeatTimeSchema = z.string().regex(HEARTBEAT_TIME_PATTERN);

export const HeartbeatSettingsSchema = z.object({
  enabled: z.boolean(),
  time: HeartbeatTimeSchema,
});
export type HeartbeatSettings = z.infer<typeof HeartbeatSettingsSchema>;

export const DEFAULT_HEARTBEAT_SETTINGS: HeartbeatSettings = {
  enabled: true,
  time: "08:00",
};

export const HeartbeatSettingsPatchSchema = z
  .object({ enabled: z.boolean(), time: HeartbeatTimeSchema })
  .partial()
  .strict();
export type HeartbeatSettingsPatch = z.infer<
  typeof HeartbeatSettingsPatchSchema
>;

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

export const HeartbeatStateSchema = HeartbeatSettingsSchema.extend({
  last: HeartbeatLastSchema.nullable(),
});
export type HeartbeatState = z.infer<typeof HeartbeatStateSchema>;

export const HeartbeatRunResultSchema = z.object({
  status: z.enum([HeartbeatRunStatus.Delivered, HeartbeatRunStatus.Quiet]),
});
export type HeartbeatRunResult = z.infer<typeof HeartbeatRunResultSchema>;

export const HeartbeatRefusalCode = {
  Invalid: "heartbeat_invalid",
  TurnRunning: "turn_running",
  Failed: "heartbeat_failed",
  GatewayOnly: "heartbeat_gateway_only",
  Unavailable: "heartbeat_unavailable",
} as const;
export type HeartbeatRefusalCode =
  (typeof HeartbeatRefusalCode)[keyof typeof HeartbeatRefusalCode];
