import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeMobileTab } from "../src/lib/mobile-tabs.ts";

// The phone nav bar's classification rule — which of the three items the
// current location lights up. Pure; the tap side is store-bound and covered
// by the mobile Playwright suite.

const at = (viewMode: string) => ({ viewMode });

describe("activeMobileTab", () => {
  it("the Agents home screen is the Agents item's own root", () => {
    assert.equal(activeMobileTab(at("agents-home")), "agents");
  });

  it("every team location belongs to Teams", () => {
    // The Teams tree is the home plus any team, whatever section is open and
    // whether or not it is narrowed to one agent.
    assert.equal(activeMobileTab(at("teams-home")), "teams");
    assert.equal(activeMobileTab(at("team")), "teams");
  });

  it("everything the More menu leads to lights More", () => {
    for (const view of [
      "inbox",
      "store",
      "skills",
      "integrations",
      "academy",
      "about-me",
      "ai-hub",
      "organization",
      "settings",
    ])
      assert.equal(activeMobileTab(at(view)), "more");
  });

  it("leaves no location dark", () => {
    assert.equal(activeMobileTab(at("some-stale-view")), "more");
  });
});
