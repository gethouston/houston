import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoutineRun } from "@houston/engine-adapter";
import { QueryClient } from "@tanstack/react-query";
import { runOptimisticWrite } from "../src/lib/optimistic-core.ts";
import {
  addOptimisticRun,
  isOptimisticRunId,
  latestRunningRunId,
  markRunCancelled,
} from "../src/lib/routine-run-optimistic.ts";

const NOW = "2026-10-08T12:00:00.000Z";
const LATER = "2026-10-08T12:00:05.000Z";

function run(overrides: Partial<RoutineRun> = {}): RoutineRun {
  return {
    id: "run-1",
    routine_id: "r1",
    status: "silent",
    session_key: "s",
    started_at: "2026-10-08T11:00:00.000Z",
    ...overrides,
  };
}

describe("addOptimisticRun", () => {
  it("paints a running placeholder for the routine", () => {
    const next = addOptimisticRun([run()], "r1", NOW);
    strictEqual(next?.length, 2);
    const placeholder = next?.[1];
    strictEqual(placeholder?.status, "running");
    strictEqual(placeholder?.routine_id, "r1");
    strictEqual(isOptimisticRunId(placeholder?.id ?? ""), true);
  });

  it("is idempotent, and gives way to a real running run", () => {
    const once = addOptimisticRun([], "r1", NOW);
    strictEqual(addOptimisticRun(once, "r1", NOW), once);
    const stopped = markRunCancelled(once, "r1", "optimistic-run:r1", NOW);
    strictEqual(addOptimisticRun(stopped, "r1", NOW), stopped);
    const real = [run({ status: "running" })];
    strictEqual(addOptimisticRun(real, "r1", NOW), real);
  });

  it("leaves a cache that never loaded alone", () => {
    strictEqual(addOptimisticRun(undefined, "r1", NOW), undefined);
  });
});

describe("markRunCancelled", () => {
  it("stops the named run", () => {
    const next = markRunCancelled(
      [run({ status: "running" })],
      "r1",
      "run-1",
      NOW,
    );
    deepStrictEqual(next?.[0], {
      ...run(),
      status: "cancelled",
      completed_at: NOW,
    });
  });

  it("a placeholder id stops the routine's newest running run", () => {
    const runs = [
      run({ id: "old", status: "running", started_at: NOW }),
      run({ id: "new", status: "running", started_at: LATER }),
    ];
    const next = markRunCancelled(runs, "r1", "optimistic-run:r1", NOW);
    deepStrictEqual(
      next?.map((r) => r.status),
      ["running", "cancelled"],
    );
  });

  it("a second pass stops nothing more", () => {
    const runs = [
      run({ id: "old", status: "running", started_at: NOW }),
      run({ id: "new", status: "running", started_at: LATER }),
    ];
    const once = markRunCancelled(runs, "r1", "optimistic-run:r1", NOW);
    strictEqual(markRunCancelled(once, "r1", "optimistic-run:r1", NOW), once);
  });

  it("leaves a run that already ended, and an empty cache, alone", () => {
    const ended = [run()];
    strictEqual(markRunCancelled(ended, "r1", "optimistic-run:r1", NOW), ended);
    strictEqual(markRunCancelled(undefined, "r1", "run-1", NOW), undefined);
  });
});

describe("latestRunningRunId", () => {
  it("names only the routine's running runs", () => {
    const runs = [
      run({ id: "a", status: "running", routine_id: "r2" }),
      run({ id: "b", status: "running", started_at: NOW }),
      run({ id: "c", status: "error", started_at: LATER }),
    ];
    strictEqual(latestRunningRunId(runs, "r1"), "b");
    strictEqual(latestRunningRunId(undefined, "r1"), undefined);
  });
});

describe("run now, then stop, while the host catches up", () => {
  it("the stop lands on the real run once the runs list reports it", async () => {
    const qc = new QueryClient();
    const key = ["routine-runs", "/a"];
    qc.setQueryData<RoutineRun[]>(key, []);
    let finishStart!: () => void;
    const started = runOptimisticWrite(
      {
        qc,
        command: "run_routine_now",
        patches: [
          {
            queryKey: key,
            apply: (runs: RoutineRun[] | undefined) =>
              addOptimisticRun(runs, "r1", NOW),
          },
        ],
        write: () =>
          new Promise<void>((resolve) => {
            finishStart = resolve;
          }),
        failure: { title: "t", description: "d" },
        invalidate: [],
      },
      () => {},
    );
    let finishStop!: () => void;
    const stopped = runOptimisticWrite(
      {
        qc,
        command: "cancel_routine_run",
        patches: [
          {
            queryKey: key,
            apply: (runs: RoutineRun[] | undefined) =>
              markRunCancelled(runs, "r1", "optimistic-run:r1", LATER),
          },
        ],
        write: () =>
          new Promise<void>((resolve) => {
            finishStop = resolve;
          }),
        failure: { title: "t", description: "d" },
        invalidate: [],
      },
      () => {},
    );
    deepStrictEqual(
      qc.getQueryData<RoutineRun[]>(key)?.map((r) => r.status),
      ["cancelled"],
    );

    finishStart();
    await started;
    await qc.fetchQuery({
      queryKey: key,
      queryFn: () => [run({ id: "real", status: "running", started_at: NOW })],
      staleTime: 0,
    });
    deepStrictEqual(
      qc.getQueryData<RoutineRun[]>(key)?.map((r) => [r.id, r.status]),
      [["real", "cancelled"]],
    );
    finishStop();
    await stopped;
  });
});
