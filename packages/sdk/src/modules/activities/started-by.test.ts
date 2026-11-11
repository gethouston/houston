import type { Activity } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import {
  type MissionStartedBy,
  type MissionStartFacts,
  missionStartedBy,
} from "./started-by";
import { toActivityItem } from "./view-model";

const SETUP = "houston:agent-setup";

describe("missionStartedBy: first match wins", () => {
  test.each<[string, MissionStartFacts, MissionStartedBy]>([
    ["a person's own mission", {}, { kind: "person" }],
    [
      "nulls read as absent",
      {
        routine_id: null,
        agent: null,
        origin_session_key: null,
        origin_agent: null,
        started_by: null,
      },
      { kind: "person" },
    ],
    ["a routine's run", { routine_id: "r1" }, { kind: "routine" }],
    [
      "a routine outranks everything",
      { routine_id: "r1", agent: SETUP, started_by: "houston" },
      { kind: "routine" },
    ],
    ["the setup task", { agent: SETUP }, { kind: "setup" }],
    [
      "setup outranks Houston",
      { agent: SETUP, started_by: "houston" },
      { kind: "setup" },
    ],
    ["another mode is not setup", { agent: "research" }, { kind: "person" }],
    ["Houston", { started_by: "houston" }, { kind: "houston" }],
    [
      "Houston outranks the agent-started marker it also carries",
      {
        started_by: "houston",
        origin_session_key: "activity-p",
        origin_agent: "ws/.assistant",
      },
      { kind: "houston" },
    ],
    [
      "an employee, named",
      {
        started_by: "employee",
        origin_session_key: "activity-p",
        origin_agent: "Personal/Scout",
      },
      { kind: "employee", agentId: "Personal/Scout" },
    ],
    ["the API", { started_by: "api" }, { kind: "api" }],
    [
      "the API outranks a legacy origin marker",
      {
        started_by: "api",
        origin_session_key: "activity-p",
        origin_agent: "writer",
      },
      { kind: "api" },
    ],
    [
      "a routine outranks the API",
      { routine_id: "r1", started_by: "api" },
      { kind: "routine" },
    ],
    [
      "setup outranks the API",
      { agent: SETUP, started_by: "api" },
      { kind: "setup" },
    ],
    ["an employee, unnamed", { started_by: "employee" }, { kind: "employee" }],
    [
      "a legacy agent-started row stays an employee's",
      { origin_session_key: "activity-p", origin_agent: "Personal/Scout" },
      { kind: "employee", agentId: "Personal/Scout" },
    ],
    [
      "a legacy Houston row is never relabeled",
      { origin_session_key: "activity-p", origin_agent: "ws/.assistant" },
      { kind: "employee", agentId: "ws/.assistant" },
    ],
    [
      "a legacy row with no starting agent",
      { origin_session_key: "activity-p" },
      { kind: "employee" },
    ],
  ])("%s", (_name, facts, expected) => {
    expect(missionStartedBy(facts)).toEqual(expected);
  });
});

test("the board item carries the decision for every surface", () => {
  const row: Activity = {
    id: "a1",
    title: "Weekly report",
    description: "",
    status: "running",
    started_by: "houston",
  };
  expect(toActivityItem(row).startedBy).toEqual({ kind: "houston" });
  expect(toActivityItem({ ...row, started_by: "api" }).startedBy).toEqual({
    kind: "api",
  });
  expect(toActivityItem({ ...row, started_by: undefined }).startedBy).toEqual({
    kind: "person",
  });
});
