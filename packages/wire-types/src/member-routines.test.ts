import { describe, expect, test } from "vitest";
import { memberRoutinesSchema } from "./member-routines";

const routine = {
  routineId: "daily",
  name: "Daily summary",
  agentSlug: "0123456789abcdef",
  agentName: "Sales",
  kind: "schedule",
  enabled: true,
};

describe("memberRoutinesSchema", () => {
  test("parses the gateway answer, untitled and paused routines included", () => {
    const body = {
      routines: [
        routine,
        {
          ...routine,
          routineId: "inbox",
          name: "",
          kind: "trigger",
          enabled: false,
        },
      ],
    };
    expect(memberRoutinesSchema.parse(body)).toEqual(body);
  });

  test("parses the empty answer", () => {
    expect(memberRoutinesSchema.parse({ routines: [] })).toEqual({
      routines: [],
    });
  });

  test.each([
    ["an unknown kind", { routines: [{ ...routine, kind: "cron" }] }],
    ["a missing list", {}],
    [
      "a missing enabled flag",
      { routines: [{ ...routine, enabled: undefined }] },
    ],
  ])("refuses %s", (_label, body) => {
    expect(memberRoutinesSchema.safeParse(body).success).toBe(false);
  });
});
