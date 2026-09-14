import { isInteractionStep } from "@houston/protocol";
import activitySchema from "@houston-ai/agent-schemas/activity.schema.json";
import Ajv from "ajv";
import { expect, test } from "vitest";

const validate = new Ajv({ formats: { "date-time": true } }).compile(
  activitySchema,
);
const activity = (step: unknown) => [
  {
    id: "a1",
    title: "Connect an AI provider",
    description: "",
    status: "needs_you",
    pending_interaction: { steps: [step] },
  },
];

test("the activity schema and wire parser accept secure provider handoffs", () => {
  const step = {
    kind: "provider_connect",
    id: "p1",
    provider: "openai-codex",
    reason: "To use your subscription.",
  };
  expect(validate(activity(step)), JSON.stringify(validate.errors)).toBe(true);
  expect(isInteractionStep(step)).toBe(true);
});

test.each([
  undefined,
  "",
  42,
])("a provider connection cannot be persisted without a provider (%s)", (provider) => {
  const step = { kind: "provider_connect", id: "p1", provider };
  expect(validate(activity(step))).toBe(false);
  expect(isInteractionStep(step)).toBe(false);
});
