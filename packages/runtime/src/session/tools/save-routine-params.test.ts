import { expect, test } from "vitest";
import { makeSaveRoutineTool } from "./save-routine";
import { SaveRoutineParams } from "./save-routine-params";

test("the schedule param teaches cron plus the @every interval form", () => {
  const description = JSON.stringify(SaveRoutineParams.properties.schedule);
  expect(description).toContain("cron expression");
  expect(description).toContain("'@every <N>m' / '@every <N>h'");
  expect(description).toContain("doesn't divide 60 (or 24) evenly");
  expect(description).toContain("use cron otherwise");
  expect(description).toContain("not '@every 1h30m'");
  expect(description).toContain("Supply this OR 'trigger'");
});

test("the tool description names both schedule forms and hides them from the user", () => {
  const tool = makeSaveRoutineTool({ call: async () => new Response() });
  expect(tool.description).toContain(
    "'schedule' (cron, or '@every <N>m' / '@every <N>h' for an uneven interval)",
  );
  expect(tool.description).toContain(
    "never mention files, JSON, cron, or '@every'",
  );
});
