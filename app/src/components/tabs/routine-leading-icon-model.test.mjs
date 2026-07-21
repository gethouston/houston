import assert from "node:assert/strict";
import { test } from "node:test";
import { routineLeadingIcon } from "./routine-leading-icon-model.ts";

const base = { id: "r1", name: "Daily digest", enabled: true };

test("a schedule routine keeps the grid's default clock", () => {
  const r = { ...base, schedule: "0 9 * * *" };
  assert.deepEqual(routineLeadingIcon(r), { kind: "schedule" });
});

test("a webhook trigger yields the webhook glyph", () => {
  const r = { ...base, trigger: { kind: "webhook", key_prefix: "abc" } };
  assert.deepEqual(routineLeadingIcon(r), { kind: "webhook" });
});

test("a Composio trigger yields the app logo keyed by toolkit slug", () => {
  const r = {
    ...base,
    trigger: {
      kind: "composio",
      toolkit: "gmail",
      trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
      trigger_config: {},
    },
  };
  assert.deepEqual(routineLeadingIcon(r), {
    kind: "composio",
    toolkit: "gmail",
  });
});

test("a legacy trigger with no kind is treated as Composio", () => {
  const r = {
    ...base,
    trigger: {
      toolkit: "slack",
      trigger_slug: "SLACK_NEW_MESSAGE",
      trigger_config: {},
    },
  };
  assert.deepEqual(routineLeadingIcon(r), {
    kind: "composio",
    toolkit: "slack",
  });
});
