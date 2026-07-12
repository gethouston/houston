import assert from "node:assert/strict";
import { test } from "node:test";
import {
  toStatusMap,
  toTriggerSummaries,
} from "../src/components/tabs/routine-trigger-maps.ts";

const routine = (over) => ({
  id: "r1",
  name: "R",
  prompt: "p",
  enabled: true,
  suppress_when_silent: true,
  chat_mode: "shared",
  integrations: [],
  created_at: "",
  updated_at: "",
  ...over,
});

test("toStatusMap indexes by routine id and tolerates null", () => {
  assert.deepEqual(toStatusMap(null), {});
  assert.deepEqual(toStatusMap(undefined), {});
  const items = [
    { routine_id: "a", status: "active" },
    { routine_id: "b", status: "error", detail: "boom" },
  ];
  const map = toStatusMap(items);
  assert.equal(map.a.status, "active");
  assert.equal(map.b.detail, "boom");
});

test("toTriggerSummaries only summarizes trigger routines", () => {
  const routines = [
    routine({ id: "cron", schedule: "0 9 * * *" }),
    routine({
      id: "evt",
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    }),
  ];
  const summaries = toTriggerSummaries(
    routines,
    (tk) => (tk === "gmail" ? "Gmail" : tk),
    (app) => `Wakes on an event in ${app}`,
  );
  assert.deepEqual(summaries, { evt: "Wakes on an event in Gmail" });
});
