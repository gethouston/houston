import assert from "node:assert/strict";
import test from "node:test";
import { typedJobAnswer } from "../src/components/context/job-brief-model.ts";
import { AGENT_ROLE_PART_MAX_LENGTH } from "../src/lib/agent-role-context.ts";

test("words taken from the filter are capped, like words typed in", () => {
  const seeded = typedJobAnswer("a".repeat(5_000));

  assert.deepEqual(seeded, {
    active: true,
    value: "a".repeat(AGENT_ROLE_PART_MAX_LENGTH),
  });
});

test("the cap counts code points, so it never splits an emoji", () => {
  const seeded = typedJobAnswer("🚚".repeat(200));

  assert.equal([...seeded.value].length, AGENT_ROLE_PART_MAX_LENGTH);
  assert.ok(!seeded.value.includes("�"));
});

test("an answer that fits arrives untouched, spaces and all", () => {
  assert.deepEqual(typedJobAnswer("Freight  dispatch "), {
    active: true,
    value: "Freight  dispatch ",
  });
});
