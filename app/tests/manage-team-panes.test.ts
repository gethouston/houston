import { deepStrictEqual } from "node:assert";
import { describe, test } from "node:test";
import { manageTeamPanes } from "../src/components/team-view/manage-team-panes.ts";
import type { TeamView } from "../src/lib/teams-model.ts";

function team(serverBacked: boolean, hasContext: boolean): TeamView {
  return {
    id: "team-1",
    name: "Payroll",
    agents: [],
    isDefault: false,
    ...(serverBacked
      ? { server: { joined: true, owner: true, memberCount: 1, sortOrder: 0 } }
      : {}),
    ...(hasContext ? { context: "Paydays are Fridays." } : {}),
  };
}

describe("manageTeamPanes", () => {
  test("context leads, agents follow on local teams", () => {
    deepStrictEqual(manageTeamPanes(team(false, false), false), [
      "context",
      "agents",
    ]);
  });

  test("server teams with context show every shared-space pane in order", () => {
    deepStrictEqual(manageTeamPanes(team(true, true), false), [
      "context",
      "agents",
      "people",
    ]);
  });

  test("server teams without context open on agents", () => {
    deepStrictEqual(manageTeamPanes(team(true, false), false), [
      "agents",
      "people",
    ]);
  });

  test("personal server teams omit people", () => {
    deepStrictEqual(manageTeamPanes(team(true, true), true), [
      "context",
      "agents",
    ]);
  });
});
