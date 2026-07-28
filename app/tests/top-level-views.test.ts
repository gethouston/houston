import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { INTEGRATIONS_VIEW_ID } from "../src/components/integrations-view/id.ts";
import { STORE_VIEW_ID } from "../src/components/store-view/id.ts";
import {
  AI_HUB_VIEW_ID,
  blockedTopLevelView,
  DASHBOARD_VIEW_ID,
  isActiveTopLevelView,
  isTopLevelView,
  SETTINGS_VIEW_ID,
  TOP_LEVEL_VIEWS,
} from "../src/lib/top-level-views.ts";

describe("isTopLevelView", () => {
  it("recognizes the top-level views", () => {
    for (const id of [
      DASHBOARD_VIEW_ID,
      SETTINGS_VIEW_ID,
      AI_HUB_VIEW_ID,
      INTEGRATIONS_VIEW_ID,
      STORE_VIEW_ID,
    ]) {
      strictEqual(isTopLevelView(id), true, id);
    }
  });

  it("is exactly those five (Usage, Permissions and Admin moved into Settings)", () => {
    // HOU-788 folded the three into Settings sections; their `viewMode` values
    // no longer exist, so a stale persisted one must fall through to the agent
    // tab branch (and get reset there) rather than resolve as a top-level view.
    strictEqual(TOP_LEVEL_VIEWS.size, 5);
    strictEqual(isTopLevelView("usage"), false);
    strictEqual(isTopLevelView("permissions"), false);
    strictEqual(isTopLevelView("organization"), false);
  });

  it("treats everything else as an agent tab", () => {
    strictEqual(isTopLevelView("chat"), false);
    strictEqual(isTopLevelView("integrations"), false);
  });
});

describe("isActiveTopLevelView", () => {
  it("only enables work for the visible top-level screen", () => {
    // A shared hook must use an explicit top-level id, not an arbitrary tab.
    strictEqual(isActiveTopLevelView(SETTINGS_VIEW_ID, SETTINGS_VIEW_ID), true);
    strictEqual(
      isActiveTopLevelView(DASHBOARD_VIEW_ID, SETTINGS_VIEW_ID),
      false,
    );
  });

  it("keeps a settings-section read active for the whole Settings screen", () => {
    // Time worked, Admin and Permissions have no screen of their own since
    // HOU-788, so their polls key off Settings being the visible screen.
    strictEqual(isActiveTopLevelView(SETTINGS_VIEW_ID, AI_HUB_VIEW_ID), false);
  });
});

describe("blockedTopLevelView", () => {
  it("never blocks the Integrations page", () => {
    // The Integrations page is ungated: every role in every mode keeps the
    // personal catalog, so a stale viewMode can never strand there.
    strictEqual(
      blockedTopLevelView(INTEGRATIONS_VIEW_ID, { showAiModels: false }),
      false,
    );
  });

  it("blocks a stale AI Models hub when its gate is off", () => {
    // A Teams member (role flipped) with a stale `ai-hub` viewMode must be
    // reported blocked and reset to the dashboard.
    strictEqual(
      blockedTopLevelView(AI_HUB_VIEW_ID, { showAiModels: false }),
      true,
    );
    strictEqual(
      blockedTopLevelView(AI_HUB_VIEW_ID, { showAiModels: true }),
      false,
    );
  });

  it("never blocks ungated top-level views or agent tabs", () => {
    for (const id of [
      DASHBOARD_VIEW_ID,
      SETTINGS_VIEW_ID,
      STORE_VIEW_ID,
      "chat",
    ]) {
      strictEqual(blockedTopLevelView(id, { showAiModels: false }), false, id);
    }
  });
});
