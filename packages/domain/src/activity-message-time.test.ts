import { activityUpdateSchema } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  applyActivityUpdate,
  createActivity,
  normalizeActivities,
} from "./activities";
import { createRoutine } from "./routines";
import { createRoutineRun, routineActivity } from "./schedule";

const earlier = "2026-10-26T10:00:00.000Z";
const now = "2026-10-27T16:25:00.000Z";

test("only an explicit message stamp changes the message time", () => {
  const card = {
    ...createActivity({ title: "Draft" }, "m1", earlier),
    last_message_at: earlier,
  };
  expect(
    applyActivityUpdate(
      card,
      { status: "needs_you" },
      now,
      undefined,
      "last_message",
    ),
  ).toMatchObject({
    last_message_at: "2026-10-27T16:25:00.000Z",
    updated_at: "2026-10-27T16:25:00.000Z",
  });
  for (const patch of [
    { title: "Renamed" },
    { status: "done" },
    { status: "archived" },
    { provider: null, model: null },
  ]) {
    expect(applyActivityUpdate(card, patch, now).last_message_at).toBe(
      "2026-10-26T10:00:00.000Z",
    );
  }
  expect(
    applyActivityUpdate(
      createActivity({ title: "Old" }, "m2", earlier),
      { title: "Renamed" },
      now,
    ),
  ).not.toHaveProperty("last_message_at");
});

test("a PATCH body cannot author the server timestamp", () => {
  expect(
    activityUpdateSchema.safeParse({ last_message_at: earlier }).success,
  ).toBe(false);
});

test("normalization preserves string message stamps and drops malformed ones", () => {
  const card = { id: "m1", title: "Draft", status: "done" };
  const { items } = normalizeActivities(
    [
      { ...card, last_message_at: earlier },
      { ...card, id: "m2", last_message_at: 42 },
      { ...card, id: "m3" },
    ],
    "activity",
  );
  expect(items.map((item) => item.last_message_at)).toEqual([
    "2026-10-26T10:00:00.000Z",
    undefined,
    undefined,
  ]);
});

test("a surfaced routine stamps both a fresh and an existing card", () => {
  const routine = createRoutine(
    { name: "Report", prompt: "Summarize", schedule: "0 9 * * *" },
    "r1",
    earlier,
  );
  const run = createRoutineRun(routine, "run1", earlier);
  const fresh = routineActivity(routine, run, undefined, "m1", now);
  expect(fresh.last_message_at).toBe("2026-10-27T16:25:00.000Z");
  expect(
    routineActivity(
      routine,
      run,
      { ...fresh, last_message_at: earlier },
      "ignored",
      now,
    ).last_message_at,
  ).toBe("2026-10-27T16:25:00.000Z");
});
