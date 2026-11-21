import { MAX_RUNS_PER_ROUTINE } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import { mergeRoutineRunArrays } from "./routine-runs-merge";
import { mergeDocumentBodies } from "./sync-back-doc-merge";

const DOC = "workspaces/W/A/.houston/routine_runs/routine_runs.json";

const minute = (n: number) =>
  new Date(Date.UTC(2026, 8, 30, 10, n)).toISOString();

const running = (id: string, startedMinute: number, fields = {}) => ({
  id,
  routine_id: "r1",
  status: "running",
  session_key: "routine-r1",
  started_at: minute(startedMinute),
  ...fields,
});

const settled = (
  id: string,
  startedMinute: number,
  status: string,
  completedMinute: number,
  fields = {},
) => ({
  ...running(id, startedMinute, fields),
  status,
  completed_at: minute(completedMinute),
});

const merge = (remote: unknown[], local: unknown[]): unknown[] =>
  JSON.parse(
    mergeDocumentBodies(DOC, JSON.stringify(local), JSON.stringify(remote)) ??
      "null",
  ) as unknown[];

const ids = (rows: unknown[]) => rows.map((row) => (row as { id: string }).id);

describe("routine run history merge", () => {
  test("keeps every run either side holds, newest start first", () => {
    const remote = [
      settled("b", 2, "surfaced", 3),
      settled("old", 0, "silent", 1),
    ];
    const local = [running("c", 4), settled("a", 1, "error", 2)];
    expect(ids(merge(remote, local))).toEqual(["c", "b", "a", "old"]);
  });

  test("a settled run beats the running copy on either side", () => {
    const done = settled("a", 1, "surfaced", 5);
    expect(merge([running("a", 1)], [done])).toEqual([done]);
    expect(merge([done], [running("a", 1)])).toEqual([done]);
  });

  test("the later completion wins between two settled copies; a tie goes remote", () => {
    const early = settled("a", 1, "error", 2);
    const late = settled("a", 1, "surfaced", 3);
    expect(merge([early], [late])).toEqual([late]);
    expect(merge([late], [early])).toEqual([late]);
    const mine = settled("a", 1, "silent", 2);
    expect(merge([early], [mine])).toEqual([early]);
  });

  test("a stopped run stays stopped even when the turn settles it later", () => {
    const stopped = settled("a", 1, "cancelled", 2, { summary: "Stopped" });
    const finished = settled("a", 1, "error", 4);
    expect(merge([stopped], [finished])).toEqual([stopped]);
    expect(merge([finished], [stopped])).toEqual([stopped]);
  });

  test("two running copies keep the remote's, and a restart either recorded", () => {
    const resumed = running("a", 1, { resumed: true });
    expect(merge([resumed], [running("a", 1)])).toEqual([resumed]);
    const paused = running("a", 1, { paused_until: "3pm" });
    expect(merge([paused], [resumed])).toEqual([
      running("a", 1, { paused_until: "3pm", resumed: true }),
    ]);
  });

  test("the per-routine cap drops the oldest after the union", () => {
    const history = (from: number, count: number, routine = "r1") =>
      Array.from({ length: count }, (_, i) =>
        settled(`${routine}-${from + i}`, from + i, "silent", from + i, {
          routine_id: routine,
        }),
      ).reverse();
    const remote = [
      ...history(0, MAX_RUNS_PER_ROUTINE),
      ...history(0, 2, "r2"),
    ];
    const local = history(MAX_RUNS_PER_ROUTINE, 3);
    const merged = ids(merge(remote, local));
    const r1 = merged.filter((id) => id.startsWith("r1-"));
    expect(r1).toHaveLength(MAX_RUNS_PER_ROUTINE);
    expect(r1[0]).toBe(`r1-${MAX_RUNS_PER_ROUTINE + 2}`);
    expect(r1.at(-1)).toBe("r1-3");
    expect(merged.filter((id) => id.startsWith("r2-"))).toEqual([
      "r2-1",
      "r2-0",
    ]);
  });

  test("a status this build does not know is terminal, never reverted to running", () => {
    const future = settled("a", 1, "skipped", 2);
    expect(merge([future], [running("a", 1)])).toEqual([future]);
    expect(merge([running("a", 1)], [future])).toEqual([future]);
    const error = settled("a", 1, "error", 3);
    expect(merge([future], [error])).toEqual([error]);
    expect(merge([error], [future])).toEqual([error]);
  });

  test("a copy with no status never beats a real one", () => {
    const { status: _dropped, ...bare } = running("a", 1);
    expect(merge([running("a", 1)], [bare])).toEqual([running("a", 1)]);
    expect(merge([bare], [running("a", 1)])).toEqual([running("a", 1)]);
  });

  test("entries that are not runs survive once, after the runs", () => {
    const junk = { note: "no id" };
    expect(
      mergeRoutineRunArrays([junk, running("a", 1)], [junk, "stray"]),
    ).toEqual([running("a", 1), junk, "stray"]);
  });

  test("a side that is not an array refuses to merge", () => {
    expect(() => mergeDocumentBodies(DOC, "{}", "[]")).toThrow(/not an array/);
  });
});
