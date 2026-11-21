import { TurnTimezoneSchema } from "@houston/wire-types";
import { refusalCode, refusalStatus } from "../refusal-code";

export const TIMEZONE_PREFERENCE = "timezone";

export interface TimezoneSeedInput {
  detected: string;
  legacy?: string | null;
}

export type TimezoneSeedResult =
  | { kind: "seeded"; timezone: string; source: "legacy" | "detected" }
  | { kind: "stored"; timezone: string }
  | { kind: "unseeded"; timezone: string }
  | { kind: "locked"; timezone: string };

const usableZone = (zone: string | undefined): zone is string =>
  Boolean(zone) && TurnTimezoneSchema.safeParse(zone).success;

function isLockedTeamRefusal(err: unknown): boolean {
  return (
    err instanceof Error &&
    refusalStatus(err) === 403 &&
    refusalCode(err) === "needs_upgrade"
  );
}

export async function seedTimezone(
  io: {
    get(key: string): Promise<string | null>;
    create(
      key: string,
      value: string,
    ): Promise<{ created: boolean; value: string }>;
  },
  input: TimezoneSeedInput,
): Promise<TimezoneSeedResult> {
  const stored = (await io.get(TIMEZONE_PREFERENCE))?.trim();
  if (stored) return { kind: "stored", timezone: stored };
  const legacy = input.legacy?.trim();
  const detected = input.detected.trim();
  const pick = usableZone(legacy)
    ? { zone: legacy, source: "legacy" as const }
    : usableZone(detected)
      ? { zone: detected, source: "detected" as const }
      : null;
  if (!pick) return { kind: "unseeded", timezone: detected };
  let out: { created: boolean; value: string };
  try {
    out = await io.create(TIMEZONE_PREFERENCE, pick.zone);
  } catch (err) {
    if (isLockedTeamRefusal(err))
      return { kind: "locked", timezone: pick.zone };
    throw err;
  }
  if (!out.created) return { kind: "stored", timezone: out.value };
  return { kind: "seeded", timezone: out.value, source: pick.source };
}
