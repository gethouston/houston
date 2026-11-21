import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { surfacePlanMinInterval } from "../src/lib/plan-min-interval.ts";
import { classifyQuietError } from "../src/lib/quiet-error-class.ts";
import { toastRoutineWriteFailure } from "../src/lib/routine-write-failure.ts";
import { useUIStore } from "../src/stores/ui.ts";

const SRC = join(import.meta.dirname, "../src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

function refusal(minutes = 15): Error {
  return Object.assign(new Error("HTTP 400"), {
    name: "HoustonEngineError",
    status: 400,
    body: {
      error: `This person's plan runs a scheduled task at most once every ${minutes} minutes.`,
      code: "plan_min_interval",
      minIntervalMinutes: minutes,
    },
  });
}

const drain = () => {
  for (const t of useUIStore.getState().toasts)
    useUIStore.getState().dismissToast(t.id);
};
afterEach(drain);

describe("the plan-floor refusal is a quiet expected class", () => {
  it("is classified as plan_min_interval; another 400 is not", () => {
    strictEqual(classifyQuietError(refusal()), "plan_min_interval");
    const badCron = Object.assign(new Error("HTTP 400"), {
      status: 400,
      body: { error: "invalid schedule" },
    });
    strictEqual(classifyQuietError(badCron), null);
  });

  it("every reporting path skips it before any capture", () => {
    const report = read("lib/error-report.ts");
    const body = report.slice(report.indexOf("export function reportError("));
    const skip = body.indexOf('quiet === "plan_min_interval"');
    ok(skip !== -1 && skip < body.indexOf("reportQuietError("), "reportError");
    ok(skip < body.indexOf("sentryCapture("), "no per-event capture");
    const toast = read("lib/error-toast.ts");
    const quiet = read("lib/quiet-state-surface.ts");
    ok(
      toast.includes(
        "surfaceQuietState(quiet, command, message, originalError)",
      ) &&
        quiet.includes('case "plan_min_interval":') &&
        quiet.includes("return surfacePlanMinInterval(originalError);"),
      "showErrorToast shows the plan copy instead of reporting",
    );
    const tauri = read("lib/tauri.ts");
    ok(
      tauri.includes("if (surfacePlanMinInterval(err)) return true;"),
      "the engine-call layer surfaces it before its bug path",
    );
  });
});

describe("the routine screen and model row on a plan-floor refusal", () => {
  it("the engine-call layer shows exactly one info toast", () => {
    ok(surfacePlanMinInterval(refusal()));
    const toasts = useUIStore.getState().toasts;
    strictEqual(toasts.length, 1);
    strictEqual(toasts[0]?.variant, "info");
  });

  it("the toast names the refusal's own floor", () => {
    ok(surfacePlanMinInterval(refusal(30)));
    const title = String(useUIStore.getState().toasts[0]?.title);
    ok(title.includes("30") && !title.includes("15"), title);
  });

  it("a body naming the code without its floor is not the refusal", () => {
    const partial = Object.assign(new Error("HTTP 400"), {
      status: 400,
      body: { error: "too often", code: "plan_min_interval" },
    });
    strictEqual(surfacePlanMinInterval(partial), false);
    strictEqual(classifyQuietError(partial), null);
  });

  it("their own failure handlers add no toast and report nothing", () => {
    for (const [title, command] of [
      ["Couldn't save", "update_routine"],
      ["Couldn't change the model", "set_routine_model"],
    ] as const) {
      const toasts: unknown[] = [];
      const reported: string[] = [];
      toastRoutineWriteFailure(
        refusal(),
        { title, command },
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
    }
  });

  it("the warming guard's refusal adds nothing over its own dialog", () => {
    const toasts: unknown[] = [];
    const reported: string[] = [];
    const warming = Object.assign(new Error("almost ready"), {
      name: "AgentWarmingError",
    });
    toastRoutineWriteFailure(
      warming,
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

  it("any other failure keeps its red toast and one report", () => {
    const toasts: unknown[] = [];
    const reported: string[] = [];
    toastRoutineWriteFailure(
      new Error("boom"),
      { title: "Couldn't save", command: "update_routine" },
      {
        addToast: (t) => toasts.push(t),
        describe: (c) => {
          reported.push(c);
          return "generic";
        },
      },
    );
    deepStrictEqual(toasts, [
      { title: "Couldn't save", description: "generic", variant: "error" },
    ]);
    deepStrictEqual(reported, ["update_routine"]);
  });

  it("the update hook owns the one refusal toast; no caller adds its own", () => {
    const hook = read("hooks/queries/use-routines.ts");
    const onError = hook.slice(
      hook.indexOf("onError: (err, { agentPath, kind }"),
    );
    ok(onError.indexOf("toastRoutineWriteFailure(") !== -1, "hook toasts");
    for (const rel of [
      "components/agent/routine-screen.tsx",
      "components/agent/routine-model-selector.tsx",
      "components/team-view/team-routines/use-team-routine-actions.ts",
    ]) {
      const src = read(rel);
      ok(!src.includes("toastRoutineWriteFailure("), rel);
      ok(!/\.mutate\([^;]*onError/s.test(src), rel);
    }
    ok(
      read("components/agent/routine-model-selector.tsx").includes(
        'kind: "model"',
      ),
    );
  });
});
