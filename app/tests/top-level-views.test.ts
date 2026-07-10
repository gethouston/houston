import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { INTEGRATIONS_VIEW_ID } from "../src/components/integrations-view/id.ts";
import { ORGANIZATION_VIEW_ID } from "../src/components/organization/id.ts";
import {
  blockedTopLevelView,
  isTopLevelView,
} from "../src/lib/top-level-views.ts";

describe("isTopLevelView", () => {
  it("recognizes the top-level views", () => {
    for (const id of [
      "dashboard",
      "settings",
      "ai-hub",
      INTEGRATIONS_VIEW_ID,
      ORGANIZATION_VIEW_ID,
    ]) {
      strictEqual(isTopLevelView(id), true, id);
    }
  });

  it("treats everything else as an agent tab", () => {
    strictEqual(isTopLevelView("chat"), false);
    strictEqual(isTopLevelView("integrations"), false);
  });
});

describe("blockedTopLevelView", () => {
  const gates = (
    showIntegrations: boolean,
    showOrganization: boolean,
  ): { showIntegrations: boolean; showOrganization: boolean } => ({
    showIntegrations,
    showOrganization,
  });

  it("blocks a stale Integrations view when its gate is off", () => {
    // The Teams-member strand: role flipped (e.g. on a space switch) while the
    // Integrations page was open. The nav entry is gone, so the stale viewMode
    // must be reported blocked and reset, never left to dead-end the shell.
    strictEqual(
      blockedTopLevelView(INTEGRATIONS_VIEW_ID, gates(false, false)),
      true,
    );
    strictEqual(
      blockedTopLevelView(INTEGRATIONS_VIEW_ID, gates(true, false)),
      false,
    );
  });

  it("blocks a stale Organization view when its gate is off", () => {
    strictEqual(
      blockedTopLevelView(ORGANIZATION_VIEW_ID, gates(true, false)),
      true,
    );
    strictEqual(
      blockedTopLevelView(ORGANIZATION_VIEW_ID, gates(false, true)),
      false,
    );
  });

  it("never blocks ungated top-level views or agent tabs", () => {
    for (const id of ["dashboard", "settings", "ai-hub", "chat"]) {
      strictEqual(blockedTopLevelView(id, gates(false, false)), false, id);
    }
  });
});
