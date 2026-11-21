import { accessDigest } from "@houston/protocol/access-digest";
import { expect, test } from "vitest";
import { claudePlanBinding } from "../../auth/claude-plan";
import { withServedPlan } from "./served-plan";

const served = {
  provider: "anthropic",
  access: "sk-ant-oat01-served",
  kind: "oauth" as const,
  subscriptionType: "max" as const,
};

test("the served token carries the plan it was served with", () => {
  const token = {
    kind: "oauth-token" as const,
    value: served.access,
    accessDigest: accessDigest(served.access),
  };
  expect(withServedPlan(token, claudePlanBinding(served))).toEqual({
    ...token,
    subscriptionType: "max",
  });
});

test("any other token runs with no plan", () => {
  const other = {
    kind: "oauth-token" as const,
    value: "sk-ant-oat01-shared-login",
    accessDigest: accessDigest("sk-ant-oat01-shared-login"),
  };
  expect(withServedPlan(other, claudePlanBinding(served))).toBe(other);
  const undigested = { kind: "oauth-token" as const, value: served.access };
  expect(withServedPlan(undigested, claudePlanBinding(served))).toBe(
    undigested,
  );
});

test("only an anthropic subscription login binds a plan", () => {
  expect(claudePlanBinding({ ...served, kind: "api_key" })).toBeUndefined();
  expect(
    claudePlanBinding({ ...served, provider: "openai-codex" }),
  ).toBeUndefined();
  expect(
    claudePlanBinding({ ...served, subscriptionType: undefined }),
  ).toBeUndefined();
  expect(claudePlanBinding(null)).toBeUndefined();
});
