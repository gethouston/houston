import type { RoutineAccountFailureCode } from "@houston/protocol";
import { expect, test } from "vitest";
import { routineFailureCode } from "./failure-code";

test("delivery expiry is classified separately from account failures", () => {
  expect(
    routineFailureCode({ delivery_failure: { code: "pool_delivery_expired" } }),
  ).toBe("pool_delivery_expired");
});

test("a fire refused for its creator's access is its own delivery code", () => {
  expect(
    routineFailureCode({ delivery_failure: { code: "creator_no_access" } }),
  ).toBe("creator_no_access");
});

test("a fire refused until the agent's data is repaired is its own delivery code", () => {
  expect(
    routineFailureCode({
      delivery_failure: { code: "agent_data_needs_repair" },
    }),
  ).toBe("agent_data_needs_repair");
});

const accountCodes: RoutineAccountFailureCode[] = [
  "creator_not_connected",
  "team_not_connected",
  "creator_needs_reconnect",
  "team_needs_reconnect",
  "out_of_credits",
  "model_unavailable",
];

test.each(accountCodes)("keeps the account failure code %s", (code) => {
  expect(routineFailureCode({ failure: { code, provider: "anthropic" } })).toBe(
    code,
  );
});

test("a no-model run is classified without asking about any account", () => {
  const readerFor = () => {
    throw new Error("no provider to ask about");
  };
  expect(routineFailureCode({ failure: { code: "no_model" } }, readerFor)).toBe(
    "no_model",
  );
});

test("an untyped summary has no classified failure", () => {
  expect(routineFailureCode({})).toBeUndefined();
});

test("the reader's signed-out account turns a not-connected run into a reconnect", () => {
  const readerFor = (provider: string) => ({
    provider,
    health: "needs_reconnect" as const,
    readerIsCreator: true,
  });
  expect(
    routineFailureCode(
      { failure: { code: "creator_not_connected", provider: "anthropic" } },
      readerFor,
    ),
  ).toBe("creator_needs_reconnect");
  // Delivery expiry is not about an account, whatever the reader says.
  expect(
    routineFailureCode(
      {
        delivery_failure: { code: "pool_delivery_expired" },
        failure: { code: "creator_not_connected", provider: "anthropic" },
      },
      readerFor,
    ),
  ).toBe("pool_delivery_expired");
});
