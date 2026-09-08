import type { AssistantOperation } from "@houston/host/src/assistant/catalog";
import { expect, test } from "vitest";
import { checkCallParams } from "./assistant-params";

/**
 * Argument validation for `houston_call`, and above all what it SAYS when it
 * refuses. The rejection is the model's only chance to fix the call in place:
 * told just "does not match", it guessed "blue", "#0000FF", "0000FF" and then
 * deleted the agent to recreate it in the colour it wanted. The accepted values
 * belong in the message.
 */

const COLOR_SCHEMA = {
  anyOf: [
    { type: "null" },
    ...[
      "charcoal",
      "forest",
      "teal",
      "navy",
      "purple",
      "rose",
      "crimson",
      "orange",
      "golden",
      "umber",
    ].map((color) => ({ const: color, type: "string" })),
  ],
};

const createAgent: AssistantOperation = {
  name: "createAgent",
  group: "agents",
  description: "Create an agent.",
  confirm: false,
  hidden: false,
  params: [
    { name: "name", required: true, schema: { type: "string" } },
    { name: "color", required: false, schema: COLOR_SCHEMA },
    {
      name: "seed",
      required: false,
      schema: {
        anyOf: [
          { type: "null" },
          { type: "object", properties: {}, additionalProperties: false },
        ],
      },
    },
  ],
  returns: { type: "object" },
  route: null,
};

function errorFor(raw: unknown): { code: string; message: string } {
  const checked = checkCallParams(createAgent, raw);
  if (checked.ok) throw new Error("expected the arguments to be refused");
  return checked.error;
}

test("a rejected enum param names every accepted value and what was given", () => {
  const error = errorFor({ name: "Dobby", color: "blue" });

  expect(error.code).toBe("invalid_param");
  expect(error.message).toBe(
    'The value given for "color" does not match what createAgent accepts. ' +
      '"color" must be one of: charcoal, forest, teal, navy, purple, rose, ' +
      'crimson, orange, golden, umber. You gave "blue". Call houston_describe ' +
      "for its full schema.",
  );
});

test("the describe hint stays, but only after the answer", () => {
  const message = errorFor({ name: "Dobby", color: "#0000FF" }).message;

  expect(message.indexOf("must be one of")).toBeLessThan(
    message.indexOf("houston_describe"),
  );
});

test("a type mismatch names the expected type and the type that arrived", () => {
  const error = errorFor({ name: 42 });

  expect(error.code).toBe("invalid_param");
  expect(error.message).toContain('"name" must be of type string');
  expect(error.message).toContain("you gave number (42)");
});

test("a shape mismatch reports the value's type rather than a bare refusal", () => {
  const message = errorFor({ name: "Dobby", seed: "just text" }).message;

  // The union carries no listable values, so the types it does declare are the
  // answer: null or object, and a string is neither.
  expect(message).toContain('"seed" must be of type null or object');
  expect(message).toContain("you gave string");
});

test("valid arguments pass through ordered as the operation declares them", () => {
  const checked = checkCallParams(createAgent, {
    color: "navy",
    name: "Dobby",
  });

  expect(checked.ok).toBe(true);
  if (!checked.ok) return;
  expect(Object.keys(checked.params)).toEqual(["name", "color"]);
});

test("the other refusals still name the parameters in play", () => {
  expect(errorFor({}).code).toBe("missing_param");
  expect(errorFor({ name: "Dobby", colour: "navy" })).toMatchObject({
    code: "unknown_param",
    message: expect.stringContaining("name, color, seed"),
  });
  expect(errorFor("not an object").code).toBe("invalid_params");
});
