import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "./personal-assistant-artifacts.ts";
import { TUTORIAL_MISSION } from "./personal-assistant-missions.ts";

test("tutorial mission is the single Plan-my-next-working-day skill with mail + calendar integrations", () => {
  assert.equal(TUTORIAL_MISSION.id, "plan-next-workday");
  assert.equal(TUTORIAL_MISSION.skillName, "plan-my-next-working-day");
  assert.deepEqual(TUTORIAL_MISSION.integrations, ["gmail", "googlecalendar"]);
});

test("assistant instructions interpolate the mission title", () => {
  const setup = defaultAssistantSetup({
    workspaceName: "Personal",
    assistantName: "Personal assistant",
    focus: "Help me plan.",
    approvalRule: "Ask first.",
  });

  const instructions = buildAssistantInstructions(
    setup,
    "Plan my next working day",
  );

  assert.match(instructions, /# Personal assistant/);
  assert.match(instructions, /Plan my next working day/);
});
