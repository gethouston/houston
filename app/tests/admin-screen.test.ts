import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { adminBodyState } from "../src/components/organization/admin-body-state.ts";
import { shouldDropAdminPin } from "../src/components/shell/view-guard-rules.ts";
import { adminScreenActive } from "../src/hooks/use-admin-screen-active.ts";

describe("Admin body state", () => {
  it("keeps reads without data pending and preserves cached data", () => {
    strictEqual(
      adminBodyState({
        gatesReady: false,
        showOrganization: false,
        orgStatus: "pending",
        hasOrg: false,
      }),
      "pending",
    );
    strictEqual(
      adminBodyState({
        gatesReady: false,
        showOrganization: false,
        orgStatus: "success",
        hasOrg: true,
      }),
      "ready",
    );
    strictEqual(
      adminBodyState({
        gatesReady: true,
        showOrganization: false,
        orgStatus: "pending",
        hasOrg: false,
      }),
      "pending",
    );
    strictEqual(
      adminBodyState({
        gatesReady: true,
        showOrganization: true,
        orgStatus: "pending",
        hasOrg: false,
      }),
      "pending",
    );
  });

  it("shows an unavailable body only for a settled org failure", () => {
    strictEqual(
      adminBodyState({
        gatesReady: true,
        showOrganization: true,
        orgStatus: "error",
        hasOrg: false,
      }),
      "unavailable",
    );
    strictEqual(
      adminBodyState({
        gatesReady: true,
        showOrganization: true,
        orgStatus: "success",
        hasOrg: true,
      }),
      "ready",
    );
  });

  it("keeps cached organization data ready after a refresh error", () => {
    strictEqual(
      adminBodyState({
        gatesReady: true,
        showOrganization: true,
        orgStatus: "error",
        hasOrg: true,
      }),
      "ready",
    );
  });
});

describe("Admin visibility", () => {
  it("reads only while Admin is on screen", () => {
    strictEqual(
      adminScreenActive({ viewMode: "admin", chatAgentId: null }, false),
      true,
    );
    strictEqual(
      adminScreenActive({ viewMode: "settings", chatAgentId: null }, false),
      false,
    );
    strictEqual(
      adminScreenActive({ viewMode: "admin", chatAgentId: "agent" }, true),
      false,
    );
    strictEqual(
      adminScreenActive({ viewMode: "admin", chatAgentId: "agent" }, false),
      true,
    );
  });
});

describe("Admin pin", () => {
  it("drops on a settled closed gate", () => {
    strictEqual(
      shouldDropAdminPin({ ready: true, showOrganization: false }),
      true,
    );
    strictEqual(
      shouldDropAdminPin({ ready: true, showOrganization: true }),
      false,
    );
    strictEqual(
      shouldDropAdminPin({ ready: false, showOrganization: false }),
      false,
    );
  });
});
