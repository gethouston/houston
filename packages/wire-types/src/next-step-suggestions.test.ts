import { expect, test } from "vitest";
import { NextStepSuggestionsSchema } from "./next-step-suggestions";

test("the additive turn preference accepts booleans and absence, refusing string booleans", () => {
  expect(NextStepSuggestionsSchema.parse(undefined)).toBeUndefined();
  expect(NextStepSuggestionsSchema.parse(true)).toBe(true);
  expect(NextStepSuggestionsSchema.parse(false)).toBe(false);
  expect(NextStepSuggestionsSchema.safeParse("false").success).toBe(false);
});
