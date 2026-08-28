import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeMobileTab } from "../src/lib/mobile-tabs.ts";
import type { TeamSectionId } from "../src/lib/teams-model.ts";

// PRODUCT-1558: the mobile tab bar's classification rule — which of the three
// tabs the current location lights up. Pure; the tap side is store-bound and
// covered by the mobile Playwright suite.

const at = (
  viewMode: string,
  teamSection: TeamSectionId | null = null,
  teamAgentFocus = false,
) => ({ viewMode, teamSection, teamAgentFocus });

describe("activeMobileTab", () => {
  it("settings lights the Settings tab", () => {
    assert.equal(activeMobileTab(at("settings")), "settings");
  });

  it("an unfocused team board lights Mission Control", () => {
    assert.equal(
      activeMobileTab(at("team", "mission-control")),
      "mission-control",
    );
    // A null section resolves to the team's first section (the board).
    assert.equal(activeMobileTab(at("team", null)), "mission-control");
  });

  it("the agent-focused board belongs to Agents", () => {
    assert.equal(
      activeMobileTab(at("team", "mission-control", true)),
      "agents",
    );
  });

  it("a team's other sections belong to Agents, not Mission Control", () => {
    assert.equal(activeMobileTab(at("team", "routines")), "agents");
    assert.equal(activeMobileTab(at("team", "files")), "agents");
    assert.equal(activeMobileTab(at("team", "settings")), "agents");
  });

  it("the Agents home screen is the Agents tab's own root", () => {
    assert.equal(activeMobileTab(at("agents-home")), "agents");
  });

  it("the drawer's long tail lands on the Agents landing tab", () => {
    for (const view of ["inbox", "store", "skills", "integrations", "academy"])
      assert.equal(activeMobileTab(at(view)), "agents");
  });
});
