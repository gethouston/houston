import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import type { RoutineRun } from "@houston/engine-adapter";
import { QueryClient } from "@tanstack/react-query";
import { runOptimisticWrite } from "../src/lib/optimistic-core.ts";
import { createOptimisticRefusal } from "../src/lib/optimistic-refusal.ts";
import { queryKeys } from "../src/lib/query-keys.ts";
import { classifyQuietError } from "../src/lib/quiet-error-class.ts";
import {
  refetchIfRoutineGone,
  surfaceRoutineGone,
} from "../src/lib/routine-gone-surface.ts";
import { toastRoutineWriteFailure } from "../src/lib/routine-write-failure.ts";
import { markToldUser } from "../src/lib/user-told-mark.ts";
import en from "../src/locales/en/routines.json" with { type: "json" };
import es from "../src/locales/es/routines.json" with { type: "json" };
import pt from "../src/locales/pt/routines.json" with { type: "json" };
import { useUIStore } from "../src/stores/ui.ts";

const AGENT = "Personal/Bob";

function gone(): Error {
  return Object.assign(new Error("routine not found (engine error 404)"), {
    name: "HoustonEngineError",
    status: 404,
    body: { error: "routine not found", code: "routine_not_found" },
  });
}

function agentGone(): Error {
  return Object.assign(new Error("agent not found (engine error 404)"), {
    name: "HoustonEngineError",
    status: 404,
    body: { error: "agent not found" },
  });
}

function recordingClient() {
  const qc = new QueryClient();
  const invalidated: unknown[] = [];
  const invalidate = qc.invalidateQueries.bind(qc);
  qc.invalidateQueries = ((filters) => {
    invalidated.push(filters?.queryKey);
    return invalidate(filters);
  }) as QueryClient["invalidateQueries"];
  return { qc, invalidated };
}

afterEach(() => {
  for (const t of useUIStore.getState().toasts)
    useUIStore.getState().dismissToast(t.id);
});

describe("routine_gone is a quiet class that still reports", () => {
  it("is classified routine_gone; an agent 404 is not", () => {
    strictEqual(classifyQuietError(gone()), "routine_gone");
    strictEqual(classifyQuietError(agentGone()), null);
  });

  it("surfaces as one quiet warning and one info toast", () => {
    const reports: unknown[][] = [];
    const err = gone();
    strictEqual(
      surfaceRoutineGone("run_routine_now", "routine not found", err, (...a) =>
        reports.push(a),
      ),
      true,
    );
    deepStrictEqual(reports, [
      ["routine_gone", "run_routine_now", "routine not found", err],
    ]);
    const toasts = useUIStore.getState().toasts;
    strictEqual(toasts.length, 1);
    strictEqual(toasts[0]?.variant, "info");
    ok(
      toasts[0]?.title === en.toasts.goneTitle ||
        toasts[0]?.title === "routines:toasts.goneTitle",
    );
  });

  it("ships its copy in every locale, without em dashes", () => {
    for (const bundle of [en, es, pt]) {
      ok(bundle.toasts.goneTitle && bundle.toasts.goneBody);
      ok(!`${bundle.toasts.goneTitle}${bundle.toasts.goneBody}`.includes("—"));
    }
  });

  it("the routine screen's own failure toast stands down once call() told", () => {
    const err = gone();
    markToldUser(err);
    const toasts: unknown[] = [];
    const reported: string[] = [];
    toastRoutineWriteFailure(
      err,
      { title: "Couldn't save", command: "update_routine" },
      {
        addToast: (t) => toasts.push(t),
        describe: (c) => {
          reported.push(c);
          return "generic";
        },
      },
    );
    deepStrictEqual(toasts, []);
    deepStrictEqual(reported, []);
  });
});

describe("a run-now refused as routine_gone", () => {
  async function runNow(err: Error) {
    const { qc, invalidated } = recordingClient();
    qc.setQueryData<RoutineRun[]>(queryKeys.routineRuns(AGENT), []);
    const reports: string[] = [];
    const toasts: unknown[] = [];
    await runOptimisticWrite(
      {
        qc,
        command: "run_routine_now",
        patches: [
          {
            queryKey: queryKeys.routineRuns(AGENT),
            apply: (runs: RoutineRun[] | undefined) => runs,
          },
        ],
        write: () => Promise.reject(err),
        failure: { title: "Couldn't start the routine", description: "x" },
        onError: (e) => refetchIfRoutineGone(qc, queryKeys.routines(AGENT), e),
      },
      createOptimisticRefusal({
        report: (command) => reports.push(command),
        addToast: (t) => toasts.push(t),
      }),
    );
    return { invalidated, reports, toasts };
  }

  it("adds no error toast over call()'s and refetches the routines list", async () => {
    const err = gone();
    markToldUser(err);
    const { invalidated, reports, toasts } = await runNow(err);
    deepStrictEqual(toasts, []);
    deepStrictEqual(reports, []);
    ok(
      invalidated.some(
        (key) =>
          JSON.stringify(key) === JSON.stringify(queryKeys.routines(AGENT)),
      ),
    );
  });

  it("any other refusal keeps its error toast and leaves the list alone", async () => {
    const { invalidated, reports, toasts } = await runNow(agentGone());
    strictEqual(toasts.length, 1);
    deepStrictEqual(reports, ["run_routine_now"]);
    ok(
      !invalidated.some(
        (key) =>
          JSON.stringify(key) === JSON.stringify(queryKeys.routines(AGENT)),
      ),
    );
  });
});

describe("a plan keep refused as routine_gone", () => {
  it("refetches the plan's routine list", () => {
    const { qc, invalidated } = recordingClient();
    refetchIfRoutineGone(qc, queryKeys.planRoutines(), gone());
    deepStrictEqual(invalidated, [queryKeys.planRoutines()]);
    refetchIfRoutineGone(qc, queryKeys.planRoutines(), agentGone());
    strictEqual(invalidated.length, 1);
  });
});
