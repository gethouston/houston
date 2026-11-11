import activitySchema from "@houston-ai/agent-schemas/activity.schema.json";
import Ajv from "ajv";
import { expect, test } from "vitest";

const validate = new Ajv({ formats: { "date-time": true } }).compile(
  activitySchema,
);
const activity = (origin: Record<string, unknown>) => [
  { id: "a1", title: "Weekly report", description: "", status: "running" },
  { id: "a2", title: "Draft", description: "", status: "running", ...origin },
];

test("the activity schema accepts the server-stamped mission origin", () => {
  const rows = activity({
    origin_session_key: "activity-a1",
    origin_agent: "Personal/Scout",
    origin_depth: 2,
    started_by: "employee",
  });
  expect(validate(rows), JSON.stringify(validate.errors)).toBe(true);
  expect(validate(activity({ started_by: "houston" }))).toBe(true);
  expect(validate(activity({ started_by: "api" }))).toBe(true);
});

test.each([
  { started_by: "person" },
  { started_by: "Houston" },
  { started_by: 1 },
  { origin_depth: 0 },
  { origin_depth: 1.5 },
  { origin_agent: 7 },
])("the activity schema refuses a malformed origin %j", (origin) => {
  expect(validate(activity(origin))).toBe(false);
});
