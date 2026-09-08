import { expect, test } from "vitest";
import {
  acceptedValues,
  expectedTypes,
  invalidParamMessage,
  jsonTypeOf,
} from "./assistant-schema-hint";

/**
 * The schema explainer. Everything it answers ends up inside an `invalid_param`
 * message, so a wrong "accepted values" list is worse than none: it would send
 * the model confidently at a value the operation refuses.
 */

const enumOf = (...values: string[]) => ({
  anyOf: values.map((value) => ({ const: value, type: "string" })),
});

test("enum, const and anyOf-of-consts all resolve to their values", () => {
  expect(acceptedValues({ enum: ["daily", "weekly"] })).toEqual([
    "daily",
    "weekly",
  ]);
  expect(acceptedValues({ const: "navy", type: "string" })).toEqual(["navy"]);
  expect(acceptedValues(enumOf("navy", "teal"))).toEqual(["navy", "teal"]);
});

test("a null branch means optional, not unlistable", () => {
  const optionalEnum = {
    anyOf: [{ type: "null" }, ...enumOf("navy", "teal").anyOf],
  };
  expect(acceptedValues(optionalEnum)).toEqual(["navy", "teal"]);
});

test("numbers and booleans are listed; structures are not", () => {
  expect(acceptedValues({ enum: [1, 2, true] })).toEqual(["1", "2", "true"]);
  expect(acceptedValues({ enum: [{ a: 1 }] })).toBeNull();
  expect(acceptedValues({ type: "string" })).toBeNull();
  expect(acceptedValues({ anyOf: [{ type: "string" }, enumOf("navy")] })).toBe(
    null,
  );
});

test("expectedTypes flattens a union and dedupes", () => {
  expect(expectedTypes({ type: "string" })).toEqual(["string"]);
  expect(
    expectedTypes({ anyOf: [{ type: "null" }, { type: "object" }] }),
  ).toEqual(["null", "object"]);
  expect(
    expectedTypes({ anyOf: [{ type: "string" }, { type: "string" }] }),
  ).toEqual(["string"]);
  expect(expectedTypes({ properties: {} })).toEqual([]);
});

test("jsonTypeOf tells null and arrays apart from objects", () => {
  expect(jsonTypeOf(null)).toBe("null");
  expect(jsonTypeOf([1])).toBe("array");
  expect(jsonTypeOf({})).toBe("object");
  expect(jsonTypeOf("x")).toBe("string");
});

test("a schema with neither values nor types still reports what arrived", () => {
  const message = invalidParamMessage({
    operation: "saveThing",
    param: "payload",
    schema: { properties: {}, required: ["a"] },
    value: [1, 2],
  });
  expect(message).toContain("You gave array ([1,2])");
  expect(message).toContain("houston_describe");
});

test("a long rejected value is truncated rather than flooding the transcript", () => {
  const message = invalidParamMessage({
    operation: "createAgent",
    param: "color",
    schema: enumOf("navy"),
    value: "x".repeat(500),
  });
  expect(message).toContain("…");
  expect(message.length).toBeLessThan(300);
});
