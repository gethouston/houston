export type TimingMarks = Record<string, number>;

export interface TurnResult {
  agent: "A" | "B";
  timings: TimingMarks;
  tokens: string[];
  root: string;
  priorRootGone: boolean;
  frames: Array<{ type: string; data: unknown }>;
}

const percentile = (values: number[], fraction: number): number => {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? sorted[0];
};

const duration = (marks: TimingMarks, from: string, to: string) => {
  const start = marks[from];
  const end = marks[to];
  return start === undefined || end === undefined ? undefined : end - start;
};

const fixed = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(1);

const PHASES: Array<[string, string, string]> = [
  ["request -> tmpdir", "t0_request", "t_tmpdir"],
  ["tmpdir -> hydrate", "t_tmpdir", "t_hydrated"],
  ["hydrate -> credential", "t_hydrated", "t_cred_written"],
  ["credential -> SSE", "t_cred_written", "t_sse_open"],
  ["SSE -> model runtime", "t_sse_open", "t_modelruntime"],
  ["provider registration", "t_modelruntime", "t_providers_registered"],
  ["model resolution", "t_providers_registered", "t_model_resolved"],
  ["backend build", "t_model_resolved", "t_backend_built"],
  ["session creation", "t_backend_built", "t_session_created"],
  ["workspace snapshot", "t_session_created", "t_snapshot"],
  ["prompt setup", "t_snapshot", "t_prompt_start"],
  ["provider first token", "t_prompt_start", "t_first_token"],
  ["stream remainder", "t_first_token", "t_prompt_end"],
  ["sync back", "t_prompt_end", "t_synced"],
  ["terminal", "t_synced", "t_terminal"],
];

export function printReport(
  label: string,
  results: TurnResult[],
  bootToListenMs: number,
): void {
  const first = results
    .map((r) => duration(r.timings, "t0_request", "t_first_token"))
    .filter((n): n is number => n !== undefined);
  const done = results
    .map((r) => duration(r.timings, "t0_request", "t_terminal"))
    .filter((n): n is number => n !== undefined);
  const hydrate = results
    .map((r) => duration(r.timings, "t_tmpdir", "t_hydrated"))
    .filter((n): n is number => n !== undefined);
  console.log(`\n=== ${label} ===`);
  console.table([
    {
      "process start -> server ready ms": fixed(bootToListenMs),
      "first token p50": fixed(percentile(first, 0.5)),
      "first token p95": fixed(percentile(first, 0.95)),
      "cold turn 1": fixed(first[0]),
      "warm p50": fixed(percentile(first.slice(1), 0.5)),
      "done p50": fixed(percentile(done, 0.5)),
      "done p95": fixed(percentile(done, 0.95)),
      "hydrate p50": fixed(percentile(hydrate, 0.5)),
      "objects p50": fixed(
        percentile(
          results.map((r) => r.timings.hydrated_objects),
          0.5,
        ),
      ),
    },
  ]);
  console.table(
    PHASES.map(([phase, from, to]) => ({
      phase,
      "median ms": fixed(
        percentile(
          results
            .map((r) => duration(r.timings, from, to))
            .filter((n): n is number => n !== undefined),
          0.5,
        ),
      ),
    })),
  );
}
