import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRIGGER_STATUS_TIMEOUT_MS,
  timedOutTriggerIds,
  toStatusMap,
  toTriggerSummaries,
  triggerBoundRoutineIds,
  withTriggerTimeouts,
} from "../src/components/agent/routine-trigger-maps.ts";

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

test("triggerBoundRoutineIds picks only event routines, in list order", () => {
  assert.deepEqual(triggerBoundRoutineIds(undefined), []);
  assert.deepEqual(triggerBoundRoutineIds(null), []);
  assert.deepEqual(
    triggerBoundRoutineIds([routine({ id: "cron", schedule: "0 9 * * *" })]),
    [],
  );
  assert.deepEqual(
    triggerBoundRoutineIds([
      routine({ id: "cron", schedule: "0 9 * * *" }),
      routine({
        id: "evt",
        trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
      }),
      routine({ id: "hook", trigger: { kind: "webhook", key_prefix: "wh_1" } }),
    ]),
    ["evt", "hook"],
  );
});

test("triggerBoundRoutineIds returns whatever id the rows carry", () => {
  assert.deepEqual(
    triggerBoundRoutineIds([
      routine({
        id: "agent-1::evt",
        trigger: { toolkit: "slack", trigger_slug: "Y", trigger_config: {} },
      }),
    ]),
    ["agent-1::evt"],
  );
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

test("toTriggerSummaries summarizes app-event and webhook routines, skips schedules", () => {
  const routines = [
    routine({ id: "cron", schedule: "0 9 * * *" }),
    routine({
      id: "evt",
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    }),
    routine({
      id: "hook",
      trigger: { kind: "webhook", key_prefix: "wh_ab12" },
    }),
  ];
  const summaries = toTriggerSummaries(
    routines,
    (tk) => (tk === "gmail" ? "Gmail" : tk),
    (app) => `Wakes on an event in ${app}`,
    "When its webhook address is called",
  );
  assert.deepEqual(summaries, {
    evt: "Wakes on an event in Gmail",
    hook: "When its webhook address is called",
  });
});

test("toTriggerSummaries treats a kindless binding as a Composio app event", () => {
  const routines = [
    routine({
      id: "legacy",
      trigger: { toolkit: "slack", trigger_slug: "Y", trigger_config: {} },
    }),
  ];
  const summaries = toTriggerSummaries(
    routines,
    (tk) => (tk === "slack" ? "Slack" : tk),
    (app) => `Wakes on an event in ${app}`,
    "When its webhook address is called",
  );
  assert.deepEqual(summaries, { legacy: "Wakes on an event in Slack" });
});

test("timedOutTriggerIds flags only long-absent statuses", () => {
  const now = 100_000;
  const firstSeen = {
    fresh: now - 1_000,
    stale: now - TRIGGER_STATUS_TIMEOUT_MS - 1,
    edge: now - TRIGGER_STATUS_TIMEOUT_MS,
  };
  const ids = ["fresh", "stale", "edge", "unseen", "hasStatus"];
  const items = [{ routine_id: "hasStatus", status: "pending" as const }];
  assert.deepEqual(timedOutTriggerIds(ids, items, firstSeen, now), [
    "stale",
    "edge",
  ]);
});

test("timedOutTriggerIds never times out a routine that has a status", () => {
  const now = 100_000;
  const firstSeen = { r1: now - TRIGGER_STATUS_TIMEOUT_MS - 10_000 };
  const items = [{ routine_id: "r1", status: "active" as const }];
  assert.deepEqual(timedOutTriggerIds(["r1"], items, firstSeen, now), []);
});

test("withTriggerTimeouts overlays an error only for timed-out ids", () => {
  const base = { r1: { routine_id: "r1", status: "active" as const } };
  assert.equal(withTriggerTimeouts(base, [], "gone"), base);
  const merged = withTriggerTimeouts(base, ["r2"], "gone");
  assert.equal(merged.r1.status, "active");
  assert.deepEqual(merged.r2, {
    routine_id: "r2",
    status: "error",
    detail: "gone",
  });
});
