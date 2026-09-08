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

test("the bare family names the SDK also accepts pass through untouched", () => {
  // They were once listed in a rewrite table that mapped each to ITSELF — a
  // table that could only ever be a no-op. The contract is pass-through, and
  // these are the ids that proved it.
  expect(toSdkModel("sonnet")).toBe("sonnet");
  expect(toSdkModel("opus")).toBe("opus");
  expect(toSdkModel("haiku")).toBe("haiku");
});
