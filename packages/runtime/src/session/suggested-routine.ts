/**
 * Optional routine suggestion parsed out of the instruction-generation
 * response. The cron expression is built and validated HERE from a constrained
 * schedule set — never taken raw from the LLM — so a hallucinated expression
 * can't create a runaway every-minute schedule. Port of the Rust engine's
 * `sessions/suggested_routine.rs`, byte-compatible on the wire.
 */

export interface SuggestedRoutine {
  name: string;
  prompt: string;
  /** 5-field cron, built and validated by the engine. */
  schedule: string;
}

/** Parse "HH:MM" (24h) into [hour, minute], rejecting out-of-range values. */
function parseHhMm(s: string): [number, number] | null {
  const parts = s.split(":");
  if (parts.length !== 2) return null;
  const hour = Number.parseInt(parts[0].trim(), 10);
  const minute = Number.parseInt(parts[1].trim(), 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return [hour, minute];
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Build a validated routine from the model's `suggestedRoutine` value.
 *
 * Returns `null` for null/missing/malformed input — the routine is optional,
 * so its absence must not fail the whole generation.
 */
export function buildRoutine(v: unknown): SuggestedRoutine | null {
  if (v === null || v === undefined || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const name = str(obj.name)?.trim() ?? "";
  const prompt = str(obj.prompt)?.trim() ?? "";
  if (!name || !prompt) return null;

  const kind = str(obj.scheduleType)?.toLowerCase();
  if (kind !== "daily" && kind !== "weekdays" && kind !== "weekly") return null;

  const timeOfDay = str(obj.timeOfDay)?.trim();
  if (!timeOfDay) return null;
  const parsed = parseHhMm(timeOfDay);
  if (!parsed) return null;
  const [hour, minute] = parsed;

  const rawDow = obj.dayOfWeek;
  const dow =
    typeof rawDow === "number" &&
    Number.isInteger(rawDow) &&
    rawDow >= 0 &&
    rawDow <= 6
      ? rawDow
      : null;

  const schedule =
    kind === "daily"
      ? `${minute} ${hour} * * *`
      : kind === "weekdays"
        ? `${minute} ${hour} * * 1-5`
        : `${minute} ${hour} * * ${dow ?? 1}`;

  return { name, prompt, schedule };
}
