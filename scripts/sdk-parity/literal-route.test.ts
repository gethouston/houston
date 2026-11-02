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

test("a literal SDK path never matches another parameterized route", () => {
  const hostRoute = {
    method: "GET",
    path: "/v1/integrations/{}/connections",
    classification: "sdk",
    source: "integrations.ts",
    group: "integrations",
  };
  const gatewayRoute = {
    pattern: "/v1/agents/{slug}/color",
    methods: ["PUT"],
    classification: "sdk" as const,
  };
  for (const key of [
    "GET /v1/integrations/composio/connections",
    "PUT /v1/agents/sol/color",
  ]) {
    expect(
      checkRules(
        [hostRoute] as Parameters<typeof checkRules>[0],
        [gatewayRoute],
        [{ name: "literal", key, keys: [key] }],
        client,
      ).filter((violation) => violation.rule === "sdk-method-unserved"),
    ).toEqual([
      {
        rule: "sdk-method-unserved",
        key: `sdk ${key}`,
        message: `@houston/sdk literal issues ${key} which no server serves`,
      },
    ]);
  }
});
