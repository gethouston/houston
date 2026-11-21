import { clampPercent, type ProviderUsageWindow, settleWindow } from "./types";

type WindowId = ProviderUsageWindow["id"];

type LegacyBlock = { utilization?: unknown; resets_at?: unknown } | null;

type LimitRow = {
  kind?: unknown;
  percent?: unknown;
  resets_at?: unknown;
  scope?: { model?: { display_name?: unknown } | null } | null;
} | null;

export type AnthropicUsageBody = {
  five_hour?: LegacyBlock;
  seven_day?: LegacyBlock;
  seven_day_opus?: LegacyBlock;
  limits?: unknown;
};

type Reading = { percent: number; resetsAt: unknown };

const WINDOWS: ReadonlyArray<{
  id: WindowId;
  minutes: number;
  legacy: "five_hour" | "seven_day" | "seven_day_opus";
}> = [
  { id: "session", minutes: 300, legacy: "five_hour" },
  { id: "week", minutes: 10_080, legacy: "seven_day" },
  { id: "week_opus", minutes: 10_080, legacy: "seven_day_opus" },
];

function limitRowId(row: LimitRow): WindowId | null {
  if (!row || typeof row !== "object") return null;
  if (row.kind === "session") return "session";
  if (row.kind === "weekly_all") return "week";
  const model = row.scope?.model?.display_name;
  if (
    row.kind === "weekly_scoped" &&
    typeof model === "string" &&
    /\bopus\b/i.test(model)
  )
    return "week_opus";
  return null;
}

function limitReadings(limits: unknown): Map<WindowId, Reading> {
  const readings = new Map<WindowId, Reading>();
  if (!Array.isArray(limits)) return readings;
  for (const row of limits as LimitRow[]) {
    const id = limitRowId(row);
    if (!id || !row || readings.has(id) || !isPercent(row.percent)) continue;
    readings.set(id, { percent: row.percent, resetsAt: row.resets_at });
  }
  return readings;
}

function legacyReading(block: unknown): Reading | null {
  if (!block || typeof block !== "object") return null;
  const { utilization, resets_at } = block as Exclude<LegacyBlock, null>;
  if (!isPercent(utilization)) return null;
  return { percent: utilization, resetsAt: resets_at };
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function anthropicWindows(
  body: AnthropicUsageBody,
  now: number,
): ProviderUsageWindow[] {
  const fromLimits = limitReadings(body.limits);
  const windows: ProviderUsageWindow[] = [];
  for (const { id, minutes, legacy } of WINDOWS) {
    const reading = fromLimits.get(id) ?? legacyReading(body[legacy]);
    if (!reading) continue;
    const window: ProviderUsageWindow = {
      id,
      usedPercent: clampPercent(reading.percent),
      resetsAt: typeof reading.resetsAt === "string" ? reading.resetsAt : null,
      windowMinutes: minutes,
    };
    windows.push(settleWindow(window, now));
  }
  return windows;
}
