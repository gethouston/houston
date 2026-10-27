import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * The Claude CLI's own startup profiler on a sample of pooled turns, so the
 * spawn-to-init cost (HOU-149) splits into the CLI's phases in prod.
 *
 * `CLAUDE_CODE_PROFILE_STARTUP=1` makes the CLI write
 * `<CLAUDE_CONFIG_DIR>/startup-perf/<session>.{json,txt}`. That folder sits
 * in the conversation's synced sessions tree, so it is read and removed right
 * after the CLI exits, before sync-back. Like the turn's network marks, this
 * is one record per process: a single-use worker runs exactly one turn.
 */

// Enough sampled turns to compare template builds in a day of prod logs; few
// enough that the profiler's own cost stays out of the harness_init p50.
export const CLAUDE_STARTUP_PROFILE_RATE = 0.05;

/** The most entries one report carries; the CLI marks about 80 checkpoints. */
const MAX_ENTRIES = 120;
const PERF_DIR = "startup-perf";
const KEY = /^[A-Za-z0-9_.-]{1,64}$/;

let armed = false;
let report: Record<string, number> | undefined;

/** Decide, once per pooled turn, whether its Claude CLI runs profiled. */
export function armClaudeStartupProfile(random: () => number = Math.random) {
  armed = random() < CLAUDE_STARTUP_PROFILE_RATE;
  report = undefined;
}

/** The env a Claude CLI run adds: the profiler switch on a sampled turn. */
export function claudeStartupProfileEnv(): Record<string, string> {
  return armed ? { CLAUDE_CODE_PROFILE_STARTUP: "1" } : {};
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const wholeMs = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;

/**
 * The CLI's startup-perf JSON as flat whole-ms entries: each checkpoint mark
 * (ms since the CLI's clock origin, first occurrence), each phase the CLI
 * sums (`phase.<name>`, from its `<name>_ms` metadata) and `node_boot`.
 * Undefined when the document is not a startup report.
 */
export function parseClaudeStartupProfile(
  value: unknown,
): Record<string, number> | undefined {
  if (!isRecord(value) || !Array.isArray(value.marks)) return undefined;
  const out: Record<string, number> = {};
  const put = (key: string, ms: number | undefined) => {
    if (ms === undefined || !KEY.test(key) || key in out) return;
    if (Object.keys(out).length < MAX_ENTRIES) out[key] = ms;
  };
  for (const mark of value.marks) {
    if (isRecord(mark) && typeof mark.name === "string")
      put(mark.name, wholeMs(mark.startTime));
  }
  if (isRecord(value.metadata)) {
    for (const [key, ms] of Object.entries(value.metadata)) {
      if (key.endsWith("_ms")) put(`phase.${key.slice(0, -3)}`, wholeMs(ms));
    }
  }
  put("node_boot", wholeMs(value.nodeBootMs));
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * After a profiled CLI run: keep the first report this turn produced and
 * remove the folder, so no profiler output reaches the synced tree. A missing
 * or unreadable report costs only the sample.
 */
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
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("[claude] startup profile unreadable:", error);
  }
  rmSync(dir, { recursive: true, force: true });
}

/** The turn's report for its terminal frame, once; later calls get none. */
export function takeClaudeStartupProfile(): Record<string, number> | undefined {
  const taken = report;
  report = undefined;
  armed = false;
  return taken;
}
