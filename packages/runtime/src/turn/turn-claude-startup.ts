import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const CLAUDE_STARTUP_PROFILE_RATE = 0.05;

const MAX_ENTRIES = 120;
const PERF_DIR = "startup-perf";
const KEY = /^[A-Za-z0-9_.-]{1,64}$/;

let armed = false;
let report: Record<string, number> | undefined;

export function armClaudeStartupProfile(
  singleUse: boolean,
  random: () => number = Math.random,
) {
  armed = singleUse && random() < CLAUDE_STARTUP_PROFILE_RATE;
  report = undefined;
}

export function claudeStartupProfileEnv(): Record<string, string> {
  return armed ? { CLAUDE_CODE_PROFILE_STARTUP: "1" } : {};
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const wholeMs = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;

export function parseClaudeStartupProfile(
  value: unknown,
): Record<string, number> | undefined {
  if (!isRecord(value) || !Array.isArray(value.marks)) return undefined;
  const out: Record<string, number> = {};
  const put = (key: string, ms: number | undefined) => {
    if (ms === undefined || !KEY.test(key) || key in out) return;
    if (Object.keys(out).length < MAX_ENTRIES) out[key] = ms;
  };
  if (isRecord(value.metadata)) {
    for (const [key, ms] of Object.entries(value.metadata)) {
      if (key.endsWith("_ms")) put(`phase.${key.slice(0, -3)}`, wholeMs(ms));
    }
  }
  put("node_boot", wholeMs(value.nodeBootMs));
  for (const mark of value.marks) {
    if (isRecord(mark) && typeof mark.name === "string")
      put(mark.name, wholeMs(mark.startTime));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// WHY: Only after the CLI stream ends; on early return the CLI may still write its report. ADR-0015
export function collectClaudeStartupProfile(configDir: string | undefined) {
  if (!armed || !configDir) return;
  const dir = join(configDir, PERF_DIR);
  try {
    for (const name of readdirSync(dir)) {
      if (report || !name.endsWith(".json")) continue;
      report = parseClaudeStartupProfile(
        JSON.parse(readFileSync(join(dir, name), "utf8")),
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    reportFailure(error);
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    reportFailure(error);
  }
}

function reportFailure(error: unknown) {
  console.error("[claude] startup profile collection failed:", error);
}

export function takeClaudeStartupProfile(): Record<string, number> | undefined {
  const taken = report;
  report = undefined;
  armed = false;
  return taken;
}
