import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  workspaceManagementDropsOrgPin,
  workspaceManagementFace,
} from "../src/components/settings/sections/workspace-management-model.ts";
import { workspaceSectionActive } from "../src/hooks/use-workspace-section-active.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("workspaceManagementFace", () => {
  it("shows the Admin dashboard to a caller the resolved gates admit", () => {
    strictEqual(
      workspaceManagementFace({
        ready: true,
        showOrganization: true,
        last: null,
      }),
      "organization",
    );
  });

  it("shows the workspace card to a caller the resolved gates refuse", () => {
    strictEqual(
      workspaceManagementFace({
        ready: true,
        showOrganization: false,
        last: null,
      }),
      "workspace",
    );
  });

  it("keeps the open Admin dashboard while a space switch reloads the gates", () => {
    // `resetCacheForSpaceChange` drops the capabilities query, so
    // `showOrganization` reads false for a beat. Falling back to the rename
    // card there would evict an owner from the screen they are standing on.
    strictEqual(
      workspaceManagementFace({
        ready: false,
        showOrganization: false,
        last: "organization",
      }),
      "organization",
    );
  });

  it("keeps the workspace card too, rather than flashing Admin at a member", () => {
    strictEqual(
      workspaceManagementFace({
        ready: false,
        showOrganization: true,
        last: "workspace",
      }),
      "workspace",
    );
  });

  it("waits on a skeleton when the gates have never answered", () => {
    strictEqual(
      workspaceManagementFace({
        ready: false,
        showOrganization: false,
        last: null,
      }),
      "pending",
    );
  });
});

describe("workspaceManagementDropsOrgPin", () => {
  it("drops a pinned Admin section this space will never open", () => {
    ok(workspaceManagementDropsOrgPin("workspace"));
  });

  it("leaves the pin for the dashboard that consumes it", () => {
    ok(!workspaceManagementDropsOrgPin("organization"));
  });

  it("holds the pin while the gates are still loading", () => {
    // The banner pins Billing and navigates in the same breath; clearing on an
    // unresolved gate would lose the deep link before Admin could honor it.
    ok(!workspaceManagementDropsOrgPin("pending"));
  });
});

describe("workspaceSectionActive", () => {
  it("is true only while Workspace management is the screen on the glass", () => {
    ok(
      workspaceSectionActive({
        viewMode: "settings",
        settingsSection: "workspace",
      }),
    );
    ok(
      !workspaceSectionActive({
        viewMode: "settings",
        settingsSection: "profile",
      }),
    );
    ok(
      !workspaceSectionActive({
        viewMode: "team",
        settingsSection: "workspace",
      }),
    );
  });
});

describe("the reads behind Workspace management are gated on it being open", () => {
  it("the section itself waits for the gates to resolve", () => {
    const src = read(
      "../src/components/settings/sections/workspace-management.tsx",
    );
    ok(
      src.includes("workspaceManagementFace"),
      "renders the face the pure decision names, not `showOrganization` alone",
    );
    ok(src.includes("ready"), "reads the gates' `ready` flag");
  });

  it("every kept-alive Workspace read shares the one active gate", () => {
    for (const rel of [
      "../src/hooks/queries/use-org-usage.ts",
      "../src/components/organization/organization-view.tsx",
    ]) {
      ok(
        read(rel).includes("useWorkspaceSectionActive"),
        `${rel} gates its read on the shared hook`,
      );
    }
  });

  it("leaves the billing summary ungated, because the shell holds it hot", () => {
    // The team-status strip renders over every screen of a team space and
    // reads the same query, so gating the Billing tab on top of it would stop
    // no request at all — a gate that costs a reader more than it saves.
    ok(
      read("../src/components/shell/team-status-banner.tsx").includes(
        "useBilling()",
      ),
      "the shell strip reads billing unconditionally",
    );
    ok(
      !read("../src/hooks/queries/use-billing.ts").includes("onScreen"),
      "useBilling takes no on-screen gate",
    );
  });
});
