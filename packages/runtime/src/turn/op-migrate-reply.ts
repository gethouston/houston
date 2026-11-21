import type { TurnSetupCode } from "./turn-layout";

export interface MigrateReply {
  status: number;
  body: unknown;
}

export const relayed = (status: number, body: unknown): MigrateReply => ({
  status: 200,
  body: {
    ok: true,
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
    events: [],
  },
});

export type MigrateFailureCode =
  | TurnSetupCode
  | "store_empty"
  | "migration_failed"
  | "migration_not_durable";

export const failed = (
  code: MigrateFailureCode,
  detail: Record<string, unknown> = {},
) => relayed(code === "migration_not_durable" ? 409 : 500, { code, ...detail });
