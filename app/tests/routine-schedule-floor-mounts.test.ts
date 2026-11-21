import { ok } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const EDITOR_TAG =
  /<(ScheduleBuilder|RoutinesGrid|RoutineRowScheduleEdit)[\s/>]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("schedule editors get the saver's own floor", () => {
  it("every editor mount passes the floor from useRoutineScheduleFloor", () => {
    const mounts = sourceFiles(SRC).filter((file) => {
      const src = readFileSync(file, "utf8");
      return EDITOR_TAG.test(src);
    });
    ok(mounts.length >= 2, "routine screen + team routines grid");
    for (const file of mounts) {
      const src = readFileSync(file, "utf8");
      ok(
        src.includes("useRoutineScheduleFloor()") &&
          /(floor|scheduleFloor)=\{/.test(src),
        `${file} passes the saver's floor`,
      );
    }
  });

  it("each save backstop judges with the same floor", () => {
    for (const rel of [
      "components/agent/routine-screen-sections.tsx",
      "components/team-view/team-routines/use-team-routine-actions.ts",
    ]) {
      const src = readFileSync(join(SRC, rel), "utf8");
      ok(src.includes("useRoutineScheduleFloor()"), `${rel} reads the floor`);
      ok(src.includes("floor.allows(cron)"), `${rel} backstops with it`);
      ok(
        !src.includes("freeScheduleAllowed") &&
          !src.includes("scheduleFloorAllows("),
        `${rel} binds no second rule`,
      );
    }
  });

  it("a server plan-floor refusal is an expected state, never a bug report", () => {
    const tauri = readFileSync(join(SRC, "lib/tauri.ts"), "utf8");
    ok(
      tauri.includes("if (surfacePlanMinInterval(err)) return true;"),
      "surfaceError hands the refusal to the plan copy before any bug path",
    );
    const surface = readFileSync(join(SRC, "lib/plan-min-interval.ts"), "utf8");
    ok(
      surface.includes("planMinIntervalRefusal(err)"),
      "the SDK classifies it",
    );
    ok(
      surface.includes("showPlanFloorToast(refusal.minIntervalMinutes)"),
      "an info toast naming the refusal's floor, no Sentry",
    );
    for (const lang of ["en", "es", "pt"]) {
      const json = JSON.parse(
        readFileSync(join(SRC, "locales", lang, "plan.json"), "utf8"),
      ) as { shortInterval?: string; shortIntervalBody?: string };
      ok(json.shortInterval && json.shortIntervalBody, `${lang} has the copy`);
      ok(
        json.shortInterval.includes("{{minutes}}"),
        `${lang} plan.shortInterval names the floor`,
      );
    }
  });

  it("every language names the floor in the stepper hint", () => {
    for (const lang of ["en", "es", "pt"]) {
      const json = JSON.parse(
        readFileSync(join(SRC, "locales", lang, "routines.json"), "utf8"),
      ) as { schedule: { minIntervalHint?: string } };
      ok(
        json.schedule.minIntervalHint?.includes("{minutes}"),
        `${lang} schedule.minIntervalHint carries {minutes}`,
      );
      ok(
        !/(at most every|como máximo cada|no máximo a cada)/.test(
          json.schedule.minIntervalHint ?? "",
        ),
        `${lang} schedule.minIntervalHint says once every`,
      );
    }
  });
});
