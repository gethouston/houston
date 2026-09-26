import { doesNotMatch, match, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_SIDEBAR_LABELS } from "../../ui/layout/src/sidebar-labels.ts";
import en from "../src/locales/en/shell.json" with { type: "json" };
import enTeams from "../src/locales/en/teams.json" with { type: "json" };
import es from "../src/locales/es/shell.json" with { type: "json" };
import esTeams from "../src/locales/es/teams.json" with { type: "json" };
import pt from "../src/locales/pt/shell.json" with { type: "json" };
import ptTeams from "../src/locales/pt/teams.json" with { type: "json" };

// The group rail's copy must speak the product's own words in every locale:
// "empleados de IA" / "funcionários de IA", and the "space" the folder moves to.
describe("sidebar group copy", () => {
  it("titles the rail band with the locale's AI Employee term", () => {
    strictEqual(en.sidebar.employeesSection, "Your AI Employees");
    strictEqual(es.sidebar.employeesSection, "Tus empleados de IA");
    strictEqual(pt.sidebar.employeesSection, "Seus funcionários de IA");
  });

  it("names AI Employees, never agents, in the drag instructions", () => {
    // The library is product-agnostic: its default speaks of items, like its
    // "Add item" default.
    doesNotMatch(DEFAULT_SIDEBAR_LABELS.dragInstructions, /\bagent\b/);
    match(en.sidebar.drag.instructions, /AI Employee/);
    match(es.sidebar.drag.instructions, /empleado de IA/);
    match(pt.sidebar.drag.instructions, /funcionário de IA/);
  });

  it("moves a group to a space, never an organization", () => {
    const flows = [enTeams, esTeams, ptTeams].map((bundle) =>
      JSON.stringify([bundle.moveTeam, bundle.moveTeamResume]),
    );
    for (const flow of flows) doesNotMatch(flow, /organi[zs]a/i);
    doesNotMatch(flows[2] ?? "", /movida/);
  });

  it("spells ícono with its accent in Spanish", () => {
    doesNotMatch(JSON.stringify([es, esTeams]), /\b[Ii]conos?\b/);
  });

  // The limit is inclusive: a 60-character name saves.
  it("states the group name limit as a maximum, not a bound to stay under", () => {
    match(enTeams.agentTeams.form.tooLong, /up to \{\{max\}\}/);
    match(esTeams.agentTeams.form.tooLong, /hasta \{\{max\}\}/);
    match(ptTeams.agentTeams.form.tooLong, /até \{\{max\}\}/);
  });

  it("names the limit by the protocol constant", () => {
    const url = new URL(
      "../src/components/shell/team-identity-name-row.tsx",
      import.meta.url,
    );
    const row = readFileSync(url, "utf8");
    match(row, /max: SIDEBAR_GROUP_NAME_MAX_CODE_POINTS/);
    doesNotMatch(row, /TEAM_NAME_MAX_RUNES/);
  });

  it("keeps only the employee routines copy that is still rendered", () => {
    for (const bundle of [enTeams, esTeams, ptTeams]) {
      strictEqual(
        Object.keys(bundle.teamView.routines).sort().join(","),
        "newRoutine,unreadable",
      );
    }
  });
});
