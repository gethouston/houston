import type {
  GenerateAgentResponse,
  SuggestedRoutine,
} from "@houston/runtime-client";

/**
 * Parsing for the Create-with-AI one-shot response (ported from the Rust
 * engine's `generate_instructions.rs` + `suggested_routine.rs`). The cron
 * expression is built and validated HERE from a constrained schedule set —
 * never taken raw from the model — so a hallucinated expression can't create
 * a runaway every-minute schedule.
 */

/** Parse "HH:MM" (24h) into [hour, minute], rejecting out-of-range values. */
function parseHhMm(s: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return [hour, minute];
}

/**
 * Build a validated routine from the model's `suggestedRoutine` value.
 * Returns null for null/missing/malformed input — the routine is optional,
 * so its absence must not fail the whole generation.
 */
export function buildRoutine(v: unknown): SuggestedRoutine | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
  if (!name || !prompt) return null;
  const kind =
    typeof obj.scheduleType === "string" ? obj.scheduleType.toLowerCase() : "";
  const time =
    typeof obj.timeOfDay === "string" ? parseHhMm(obj.timeOfDay) : null;
  if (!time) return null;
  const [hour, minute] = time;
  const rawDow = obj.dayOfWeek;
  const dow =
    typeof rawDow === "number" &&
    Number.isInteger(rawDow) &&
    rawDow >= 0 &&
    rawDow <= 6
      ? rawDow
      : undefined;

  let schedule: string;
  if (kind === "daily") schedule = `${minute} ${hour} * * *`;
  else if (kind === "weekdays") schedule = `${minute} ${hour} * * 1-5`;
  else if (kind === "weekly") schedule = `${minute} ${hour} * * ${dow ?? 1}`;
  else return null;

  return { name, prompt, schedule };
}

/**
 * Parse the model's JSON reply into the wire result. Tolerates markdown fences
 * and a missing/odd `suggestedIntegrations`; a missing `instructions` field is
 * a hard error (there is nothing to show the user).
 */
export function parseGenerateResult(raw: string): GenerateAgentResponse {
  const cleaned = raw
    .trim()
    .replace(/^```json/, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  let v: unknown;
  try {
    v = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!v || typeof v !== "object") {
    throw new Error("model reply is not a JSON object");
  }
  const obj = v as Record<string, unknown>;

  const instructions = obj.instructions;
  if (typeof instructions !== "string") {
    throw new Error("missing 'instructions' field in response");
  }

  const suggestedIntegrations = Array.isArray(obj.suggestedIntegrations)
    ? obj.suggestedIntegrations.filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  return {
    name: typeof obj.name === "string" ? obj.name : "",
    instructions,
    suggestedIntegrations,
    suggestedRoutine: buildRoutine(obj.suggestedRoutine),
  };
}
