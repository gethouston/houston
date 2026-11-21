import { HANDS_ON_SURFACES, isInteractionStep } from "@houston/protocol";
import activitySchema from "@houston-ai/agent-schemas/activity.schema.json";
import Ajv from "ajv";
import { expect, test } from "vitest";

const validate = new Ajv({ formats: { "date-time": true } }).compile(
  activitySchema,
);
const activity = (step: unknown) => [
  {
    id: "a1",
    title: "Finish this in Houston",
    description: "",
    status: "needs_you",
    pending_interaction: { steps: [step] },
  },
];

test("the activity schema and wire parser accept every hands-on screen", () => {
  for (const surface of HANDS_ON_SURFACES) {
    const step = {
      kind: "hands_on",
      id: "h1",
      surface,
      reason: "Only you can do this part.",
    };
    expect(validate(activity(step)), JSON.stringify(validate.errors)).toBe(
      true,
    );
    expect(isInteractionStep(step)).toBe(true);
  }
});

test("an errand on one employee's screen persists the employee it names", () => {
  const step = {
    kind: "hands_on",
    id: "h1",
    surface: "agentApiAccess",
    agentId: "agent-7",
  };
  expect(validate(activity(step)), JSON.stringify(validate.errors)).toBe(true);
  expect(isInteractionStep(step)).toBe(true);
  expect(validate(activity({ ...step, agentId: "" }))).toBe(false);
  expect(isInteractionStep({ ...step, agentId: "" })).toBe(false);
});

test.each([
  undefined,
  "",
  "settings",
  42,
])("an errand cannot be persisted naming a screen Houston has no map for (%s)", (surface) => {
  const step = { kind: "hands_on", id: "h1", surface };
  expect(validate(activity(step))).toBe(false);
});
