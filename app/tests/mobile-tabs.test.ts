import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeMobileTab, phoneChromeHidden } from "../src/lib/mobile-tabs.ts";

// The phone nav bar's classification rule — which of the two items the
// current location lights up. Pure; the tap side is store-bound and covered
// by the mobile Playwright suite.

const at = (viewMode: string) => ({ viewMode });

describe("activeMobileTab", () => {
  it("the AI Employees list is the AI Employees item's own root", () => {
    assert.equal(activeMobileTab(at("agents-home")), "agents");
  });

  it("an employee's own screen belongs to AI Employees", () => {
    assert.equal(activeMobileTab(at("agent")), "agents");
  });

  it("everything the More menu leads to lights More", () => {
    for (const view of [
      "store",
      "skills",
      "integrations",
      "academy",
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

// The bottom chrome's own rule: a chat is a push, so the bar leaves while one
// is up, whichever door led there.
describe("phoneChromeHidden", () => {
  const on = (viewMode: string) => ({
    viewMode,
    chatAgentId: null,
    missionPanelOpen: false,
  });

  it("stays for the tab roots and the More menu's screens", () => {
    for (const view of ["agents-home", "agent", "settings", "store"])
      assert.equal(phoneChromeHidden(on(view)), false);
  });

  it("leaves under the pushed mission chat", () => {
    assert.equal(
      phoneChromeHidden({ ...on("agent"), chatAgentId: "agent-1" }),
      true,
    );
  });

  it("leaves under the board's full-screen mission panel", () => {
    assert.equal(
      phoneChromeHidden({ ...on("agent"), missionPanelOpen: true }),
      true,
    );
  });

  it("leaves under the assistant, a chat reached from More", () => {
    assert.equal(phoneChromeHidden(on("assistant")), true);
  });
});
