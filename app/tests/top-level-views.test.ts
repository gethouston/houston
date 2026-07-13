import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { INTEGRATIONS_VIEW_ID } from "../src/components/integrations-view/id.ts";
import { ORGANIZATION_VIEW_ID } from "../src/components/organization/id.ts";
import { USAGE_VIEW_ID } from "../src/components/usage-view/id.ts";
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
      USAGE_VIEW_ID,
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
  const gates = (over: {
    showIntegrations?: boolean;
    showAiModels?: boolean;
    showOrganization?: boolean;
  }): {
    showIntegrations: boolean;
    showAiModels: boolean;
    showOrganization: boolean;
  } => ({
    showIntegrations: over.showIntegrations ?? true,
    showAiModels: over.showAiModels ?? true,
    showOrganization: over.showOrganization ?? true,
  });

  it("blocks a stale Integrations view when its gate is off", () => {
    // The Teams-member strand: role flipped (e.g. on a space switch) while the
    // Integrations page was open. The nav entry is gone, so the stale viewMode
    // must be reported blocked and reset, never left to dead-end the shell.
    strictEqual(
      blockedTopLevelView(
        INTEGRATIONS_VIEW_ID,
        gates({ showIntegrations: false }),
      ),
      true,
    );
    strictEqual(
      blockedTopLevelView(
        INTEGRATIONS_VIEW_ID,
        gates({ showIntegrations: true }),
      ),
      false,
    );
  });

  it("blocks a stale AI Models hub when its gate is off", () => {
    // Same strand for the hub: a Teams member (role flipped) with a stale
    // `ai-hub` viewMode must be reported blocked and reset to the dashboard.
    strictEqual(
      blockedTopLevelView("ai-hub", gates({ showAiModels: false })),
      true,
    );
    strictEqual(
      blockedTopLevelView("ai-hub", gates({ showAiModels: true })),
      false,
    );
  });

  it("blocks a stale Usage page when the AI Models gate is off", () => {
    // Usage reads the same workspace-central provider accounts the hub
    // manages, so it shares the hub's gate exactly.
    strictEqual(
      blockedTopLevelView(USAGE_VIEW_ID, gates({ showAiModels: false })),
      true,
    );
    strictEqual(
      blockedTopLevelView(USAGE_VIEW_ID, gates({ showAiModels: true })),
      false,
    );
  });

  it("blocks a stale Organization view when its gate is off", () => {
    strictEqual(
      blockedTopLevelView(
        ORGANIZATION_VIEW_ID,
        gates({ showOrganization: false }),
      ),
      true,
    );
    strictEqual(
      blockedTopLevelView(
        ORGANIZATION_VIEW_ID,
        gates({ showOrganization: true }),
      ),
      false,
    );
  });

  it("never blocks ungated top-level views or agent tabs", () => {
    for (const id of ["dashboard", "settings", "chat"]) {
      strictEqual(
        blockedTopLevelView(
          id,
          gates({
            showIntegrations: false,
            showAiModels: false,
            showOrganization: false,
          }),
        ),
        false,
        id,
      );
    }
  });
});
