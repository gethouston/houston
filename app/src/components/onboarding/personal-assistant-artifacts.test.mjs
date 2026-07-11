import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "./personal-assistant-artifacts.ts";

test("assistant instructions interpolate the assistant name + focus", () => {
  const setup = defaultAssistantSetup({
    workspaceName: "Personal",
    assistantName: "Personal assistant",
    focus: "Help me plan.",
    approvalRule: "Ask first.",
  });

  const instructions = buildAssistantInstructions(setup);

  assert.match(instructions, /# Personal assistant/);
  assert.match(instructions, /Help me plan\./);
  assert.match(instructions, /Ask first\./);
});

test("assistant instructions carry no stale 'First workflow' section", () => {
  const setup = defaultAssistantSetup({
    workspaceName: "Personal",
    assistantName: "Personal assistant",
    focus: "Help me plan.",
    approvalRule: "Ask first.",
  });

  const instructions = buildAssistantInstructions(setup);

  // The mission/firstWorkflow story is gone — the seeded routine + skill are the
  // day-one workflows now, so the instructions point at those instead.
  assert.doesNotMatch(instructions, /First workflow/i);
  assert.match(instructions, /morning-briefing routine/);
  assert.match(instructions, /meeting-prep skill/);
});
