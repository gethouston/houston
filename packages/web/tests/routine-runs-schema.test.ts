import type { RoutineRun } from "@houston/protocol";
import type { RoutineRun as WireRoutineRun } from "@houston/wire-types";
import routineRunsSchema from "@houston-ai/agent-schemas/routine_runs.schema.json";
import Ajv from "ajv";
import { expect, test } from "vitest";

const validate = new Ajv({ formats: { "date-time": true } }).compile(
  routineRunsSchema,
);
const run = {
  id: "run1",
  routine_id: "r1",
  status: "error" as const,
  session_key: "",
  started_at: "2026-10-04T09:00:00.000Z",
  completed_at: "2026-10-04T09:15:00.000Z",
  summary:
    "The routine could not start before its delivery deadline. Retry the routine.",
  delivery_failure: { code: "pool_delivery_expired" as const },
} satisfies RoutineRun & WireRoutineRun;
const { delivery_failure: _, ...legacy } = run;

test("the protocol row from cloud validates with a delivery failure", () => {
  expect(validate([run]), JSON.stringify(validate.errors)).toBe(true);
});

test("the schema accepts a fire refused for its creator's access", () => {
  const refused = {
    ...legacy,
    delivery_failure: { code: "creator_no_access" as const },
  } satisfies RoutineRun & WireRoutineRun;
  expect(validate([refused]), JSON.stringify(validate.errors)).toBe(true);
});

test("the schema accepts a fire refused until the agent's data is repaired", () => {
  const blocked = {
    ...legacy,
    delivery_failure: { code: "agent_data_needs_repair" as const },
  } satisfies RoutineRun & WireRoutineRun;
  expect(validate([blocked]), JSON.stringify(validate.errors)).toBe(true);
});

test("the schema accepts existing account failures and resumed runs", () => {
  expect(
    validate([
      {
        ...legacy,
        failure: { code: "out_of_credits", provider: "anthropic" },
      },
      { ...legacy, status: "running", resumed: true },
    ]),
    JSON.stringify(validate.errors),
  ).toBe(true);
});

test("the schema accepts a usage-limit failure with or without a reset", () => {
  const withReset = {
    ...legacy,
    failure: {
      code: "usage_limit" as const,
      provider: "anthropic",
      model: "claude-fable-5",
      resets_at: "2026-10-13T05:00:00.000Z",
    },
  } satisfies RoutineRun & WireRoutineRun;
  const unknownReset = {
    ...legacy,
    failure: {
      code: "usage_limit" as const,
      provider: "anthropic",
      model: null,
      resets_at: null,
    },
  } satisfies RoutineRun & WireRoutineRun;
  expect(
    validate([withReset, unknownReset]),
    JSON.stringify(validate.errors),
  ).toBe(true);
});

test.each([
  { delivery_failure: { code: "out_of_credits" } },
  { delivery_failure: {} },
  {
    delivery_failure: { code: "pool_delivery_expired", provider: "anthropic" },
  },
  { failure: { code: "pool_delivery_expired", provider: "anthropic" } },
  { failure: { code: "out_of_credits" } },
  { failure: { code: "unknown", provider: "anthropic" } },
  { failure: { code: "usage_limit", provider: "anthropic" } },
  { failure: { code: "usage_limit", provider: "anthropic", resets_at: 5 } },
  { resumed: false },
])("the schema rejects malformed run fields %j", (fields) => {
  expect(validate([{ ...run, ...fields }])).toBe(false);
});

test("rows without the additive fields still validate", () => {
  expect(validate([legacy]), JSON.stringify(validate.errors)).toBe(true);
});

test("the schema accepts a no-model failure, which names no provider", () => {
  expect(
    validate([{ ...legacy, failure: { code: "no_model" } }]),
    JSON.stringify(validate.errors),
  ).toBe(true);
  expect(
    validate([{ ...legacy, failure: { code: "no_model", provider: "x" } }]),
  ).toBe(false);
});
