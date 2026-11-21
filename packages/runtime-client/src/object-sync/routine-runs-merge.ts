import { isDeepStrictEqual } from "node:util";
import { pruneRoutineRuns, type RoutineRunStatus } from "@houston/protocol";

export const ROUTINE_RUNS_DOC = ".houston/routine_runs/routine_runs.json";

export const ROUTINE_RUNS_MERGE_ROUNDS = 10;

type Row = Record<string, unknown> & { id: string; routine_id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRow(value: unknown): value is Row {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.routine_id === "string"
  );
}

const PROGRESS = { malformed: 0, running: 1, settled: 2 } as const;
const RUNNING: RoutineRunStatus = "running";

function progress(row: Row): number {
  if (typeof row.status !== "string") return PROGRESS.malformed;
  return row.status === RUNNING ? PROGRESS.running : PROGRESS.settled;
}

function instant(row: Row, field: "started_at" | "completed_at"): number {
  const value = row[field];
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function pickRun(local: Row, remote: Row): Row {
  const [mine, theirs] = [progress(local), progress(remote)];
  if (mine !== theirs) return mine > theirs ? local : remote;
  if (mine < PROGRESS.settled) {
    return local.resumed === true && remote.resumed !== true
      ? { ...remote, resumed: true }
      : remote;
  }
  const localCancelled = local.status === "cancelled";
  if (localCancelled !== (remote.status === "cancelled")) {
    return localCancelled ? local : remote;
  }
  return instant(local, "completed_at") > instant(remote, "completed_at")
    ? local
    : remote;
}

function byId(items: readonly unknown[]): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const item of items) {
    if (!isRow(item)) continue;
    const seen = out.get(item.id);
    out.set(item.id, seen ? pickRun(item, seen) : item);
  }
  return out;
}

export function mergeRoutineRunArrays(
  remote: readonly unknown[],
  local: readonly unknown[],
): unknown[] {
  const remoteRuns = byId(remote);
  const localRuns = byId(local);
  const merged: Row[] = [];
  for (const [id, row] of remoteRuns) {
    const mine = localRuns.get(id);
    merged.push(mine ? pickRun(mine, row) : row);
  }
  for (const [id, row] of localRuns) {
    if (!remoteRuns.has(id)) merged.push(row);
  }
  merged.sort((a, b) => {
    const [x, y] = [instant(a, "started_at"), instant(b, "started_at")];
    return x === y ? 0 : x > y ? -1 : 1;
  });
  const remoteLoose = remote.filter((item) => !isRow(item));
  const localLoose = local.filter(
    (item) =>
      !isRow(item) &&
      !remoteLoose.some((kept) => isDeepStrictEqual(kept, item)),
  );
  return [...pruneRoutineRuns(merged), ...remoteLoose, ...localLoose];
}
