import { expect, test } from "vitest";
import { checkRules } from "./rules";

const client = { sdk: [], native: [], unbound: [] };

test("a parameterized server route serves a literal SDK preference URL", () => {
  const route = {
    pattern: "/v1/preferences/{key}",
    methods: ["PUT"],
    classification: "sdk" as const,
  };
  const methods = [
    {
      name: "set",
      key: "PUT /v1/preferences/{}",
      keys: ["PUT /v1/preferences/{}"],
    },
    {
      name: "setNextStepSuggestions",
      key: "PUT /v1/preferences/next_step_suggestions",
      keys: ["PUT /v1/preferences/next_step_suggestions"],
    },
  ];
  expect(checkRules([], [route], methods, client)).toEqual([]);
  for (const key of [
    "GET /v1/preferences/next_step_suggestions",
    "PUT /v1/preferences/next_step_suggestions/extra",
    "PUT /v1/other/next_step_suggestions",
  ]) {
    expect(
      checkRules(
        [],
        [route],
        [{ name: "wrong", key, keys: [key] }],
        client,
      ).some((violation) => violation.rule === "sdk-method-unserved"),
    ).toBe(true);
  }
});
