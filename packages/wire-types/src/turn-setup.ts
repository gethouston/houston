export type TurnSetupCode =
  | "hydrate_over_cap"
  | "layout_unexpected"
  | "agent_not_migrated"
  | "message_refused"
  | "credential_write_failed";

export interface TurnSetupFailure {
  code: TurnSetupCode;
  detail?: string;
}

export const TURN_SETUP_CODES: readonly TurnSetupCode[] = [
  "hydrate_over_cap",
  "layout_unexpected",
  "agent_not_migrated",
  "message_refused",
  "credential_write_failed",
];

const asCode = (value: unknown): TurnSetupCode | null =>
  typeof value === "string" &&
  (TURN_SETUP_CODES as readonly string[]).includes(value)
    ? (value as TurnSetupCode)
    : null;

export function parseTurnSetupFailure(data: unknown): TurnSetupFailure | null {
  if (typeof data !== "object" || data === null) return null;
  const value = data as Record<string, unknown>;
  const code = asCode(value.code) ?? asCode(value.message);
  if (!code) return null;
  return typeof value.detail === "string"
    ? { code, detail: value.detail }
    : { code };
}
