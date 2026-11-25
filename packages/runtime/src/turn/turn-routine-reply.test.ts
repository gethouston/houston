import type { RoutineRun } from "@houston/protocol";
import { expect, test } from "vitest";
import { routineRunError } from "./turn-routine-reply";

const NOW = "2026-11-22T12:00:00.000Z";
const row: RoutineRun = {
  id: "t1",
  routine_id: "r1",
  status: "running",
  session_key: "routine-r1",
  started_at: "2026-11-22T11:59:00.000Z",
};
const GONE =
  '410 {"type":"about:blank","title":"Gone","status":410,"detail":"gone"}';

test("an untyped provider error types the run and keeps the provider's own words", () => {
  const run = routineRunError(
    row,
    {
      content: "",
      providerError: { kind: "unknown", provider: "nvidia", raw_excerpt: GONE },
    },
    { nowIso: NOW },
  );
  expect(run).toMatchObject({
    status: "error",
    summary: GONE,
    failure: { code: "provider_error", provider: "nvidia" },
  });
});

test("a typed wall gets its sentence, a plain turn error its message, an answer nothing", () => {
  const walled = routineRunError(
    row,
    {
      content: "",
      providerError: {
        kind: "quota_exhausted",
        provider: "anthropic",
        model: null,
        scope: "paid_plan",
        resets_at: null,
        message: "x",
      },
    },
    { nowIso: NOW },
  );
  expect(walled?.failure).toEqual({
    code: "out_of_credits",
    provider: "anthropic",
  });
  expect(walled?.summary).toContain("out of credits");
  expect(
    routineRunError(row, { content: "" }, { nowIso: NOW, turnError: "boom" }),
  ).toMatchObject({ status: "error", summary: "boom" });
  expect(routineRunError(row, { content: "done" }, { nowIso: NOW })).toBeNull();
});
