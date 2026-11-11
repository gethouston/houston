import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { missionStartedBy } from "@houston/sdk/mission-started-by";
import { AGENT_SETUP_AGENT_MODE } from "../src/lib/agent-setup-mode.ts";
import {
  type MissionOriginLabels,
  missionCardTags,
  missionOriginLabel,
} from "../src/lib/mission-card.ts";

const labels: MissionOriginLabels = {
  routine: "Routine",
  setup: "Set up",
  houston: "Started by Houston",
  api: "Started through the API",
  employee: "Started by AI Employee",
  employeeNamed: (name) => `Started by ${name}`,
};

describe("missionOriginLabel", () => {
  it("leaves the person's own mission untagged", () => {
    strictEqual(missionOriginLabel({ kind: "person" }, labels), undefined);
  });

  it("names each origin in its own words", () => {
    strictEqual(missionOriginLabel({ kind: "routine" }, labels), "Routine");
    strictEqual(missionOriginLabel({ kind: "setup" }, labels), "Set up");
    strictEqual(
      missionOriginLabel({ kind: "houston" }, labels),
      "Started by Houston",
    );
  });

  it("names the employee when the roster knows it, else the generic label", () => {
    const employee = { kind: "employee", agentId: "writer" } as const;
    strictEqual(
      missionOriginLabel(employee, labels, "Marisol"),
      "Started by Marisol",
    );
    strictEqual(missionOriginLabel(employee, labels), "Started by AI Employee");
  });

  it("reads the SDK's decision for every seeded row the boards show", () => {
    const tagOf = (row: Parameters<typeof missionStartedBy>[0]) =>
      missionOriginLabel(missionStartedBy(row), labels);
    strictEqual(tagOf({ started_by: "houston" }), "Started by Houston");
    strictEqual(tagOf({ started_by: "api" }), "Started through the API");
    strictEqual(tagOf({ routine_id: "r1" }), "Routine");
    strictEqual(tagOf({ agent: AGENT_SETUP_AGENT_MODE }), "Set up");
    // A row older than `started_by` keeps today's label: never relabeled.
    strictEqual(
      tagOf({ origin_session_key: "conv-parent" }),
      "Started by AI Employee",
    );
    strictEqual(tagOf({}), undefined);
  });
});

describe("missionCardTags", () => {
  it("wears the origin tag alone, or none", () => {
    deepStrictEqual(missionCardTags("Routine"), ["Routine"]);
    strictEqual(missionCardTags(undefined), undefined);
  });
});
