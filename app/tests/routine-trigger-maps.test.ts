import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRIGGER_STATUS_TIMEOUT_MS,
  timedOutTriggerIds,
  toStatusMap,
  toTriggerSummaries,
  withTriggerTimeouts,
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
  // On-disk routines saved before the union carry no `kind`; they must still
  // resolve through the app-event branch, never the webhook one.
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
    fresh: now - 1_000, // seen 1s ago — still verifying
    stale: now - TRIGGER_STATUS_TIMEOUT_MS - 1, // past the window
    edge: now - TRIGGER_STATUS_TIMEOUT_MS, // exactly at the window
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
  // Even long-seen, a real status item wins and is never synthesized over.
  const firstSeen = { r1: now - TRIGGER_STATUS_TIMEOUT_MS - 10_000 };
  const items = [{ routine_id: "r1", status: "active" as const }];
  assert.deepEqual(timedOutTriggerIds(["r1"], items, firstSeen, now), []);
});

test("withTriggerTimeouts overlays an error only for timed-out ids", () => {
  const base = { r1: { routine_id: "r1", status: "active" as const } };
  assert.equal(withTriggerTimeouts(base, [], "gone"), base); // untouched
  const merged = withTriggerTimeouts(base, ["r2"], "gone");
  assert.equal(merged.r1.status, "active");
  assert.deepEqual(merged.r2, {
    routine_id: "r2",
    status: "error",
    detail: "gone",
  });
});
