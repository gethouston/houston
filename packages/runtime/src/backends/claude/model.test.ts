import { expect, test } from "vitest";
import { toSdkModel } from "./model";

test("native Anthropic dash-form ids pass through unchanged", () => {
  expect(toSdkModel("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  expect(toSdkModel("claude-opus-4-5")).toBe("claude-opus-4-5");
  expect(toSdkModel("claude-haiku-4-5")).toBe("claude-haiku-4-5");
});

test("an unknown / future model id passes through rather than being dropped", () => {
  expect(toSdkModel("claude-opus-9-9")).toBe("claude-opus-9-9");
});

test("a mapped alias resolves through the table", () => {
  expect(toSdkModel("sonnet")).toBe("sonnet");
  expect(toSdkModel("opus")).toBe("opus");
});
