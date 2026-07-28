import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  blockedSettingsSection,
  parseSettingsSection,
  SETTINGS_SECTION_IDS,
  settingsSectionGate,
  settingsSectionNeedsWorkspace,
} from "../src/lib/settings-sections.ts";

describe("SETTINGS_SECTION_IDS", () => {
  it("is the exact section set", () => {
    deepStrictEqual(
      [...SETTINGS_SECTION_IDS],
      [
        "profile",
        "apiKeys",
        "workspaceContext",
        "userContext",
        "shortcuts",
        "reportBug",
        "migration",
        // HOU-788: the three surfaces that used to be sidebar entries.
        "usage",
        "permissions",
        "organization",
      ],
    );
  });
});

describe("parseSettingsSection", () => {
  it("passes a valid section id through", () => {
    strictEqual(parseSettingsSection("profile"), "profile");
    strictEqual(parseSettingsSection("apiKeys"), "apiKeys");
    strictEqual(parseSettingsSection("reportBug"), "reportBug");
  });

  it("passes the moved surfaces through (HOU-788 deep links)", () => {
    // The blocked-app CTA, the team-status banner and the create-team toast all
    // pin one of these before switching to Settings.
    strictEqual(parseSettingsSection("usage"), "usage");
    strictEqual(parseSettingsSection("permissions"), "permissions");
    strictEqual(parseSettingsSection("organization"), "organization");
  });

  it("rejects an unknown string as null", () => {
    strictEqual(parseSettingsSection("nope"), null);
    strictEqual(parseSettingsSection("integrations"), null);
    strictEqual(parseSettingsSection(""), null);
    // "connectedAccounts" was folded into the global Integrations page (the ONE
    // by-app lens); the Settings row now deep-links there, so it is no longer a
    // settings section and a stale deep-link must not land.
    strictEqual(parseSettingsSection("connectedAccounts"), null);
    // "members" was removed with the Settings > Members surface (the Admin
    // People tab is now the canonical home); a stale deep-link must not land.
    strictEqual(parseSettingsSection("members"), null);
  });

  it("maps null to null", () => {
    strictEqual(parseSettingsSection(null), null);
  });
});

describe("blockedSettingsSection", () => {
  const gates = (over: {
    showOrganization?: boolean;
    showAiModels?: boolean;
  }) => ({
    showOrganization: over.showOrganization ?? true,
    showAiModels: over.showAiModels ?? true,
  });

  it("blocks Admin and Permissions when the org gate is off", () => {
    for (const id of ["organization", "permissions"] as const) {
      strictEqual(
        blockedSettingsSection(id, gates({ showOrganization: false })),
        true,
        id,
      );
      strictEqual(
        blockedSettingsSection(id, gates({ showOrganization: true })),
        false,
        id,
      );
    }
  });

  it("blocks Usage when the AI Models gate is off", () => {
    // Usage reads the same workspace-central provider accounts the AI Models
    // hub manages, so it shares the hub's gate exactly.
    strictEqual(
      blockedSettingsSection("usage", gates({ showAiModels: false })),
      true,
    );
    strictEqual(
      blockedSettingsSection("usage", gates({ showAiModels: true })),
      false,
    );
  });

  it("never blocks an ungated section", () => {
    for (const id of [
      "profile",
      "apiKeys",
      "workspaceContext",
      "userContext",
      "shortcuts",
      "reportBug",
      "migration",
    ] as const) {
      strictEqual(
        blockedSettingsSection(
          id,
          gates({ showOrganization: false, showAiModels: false }),
        ),
        false,
        id,
      );
    }
  });
});

// The gates are computed from `capabilities`, which is null while the query is
// in flight — so "denied" and "not answered yet" look identical to
// `blockedSettingsSection`. Acting on that window dumped an owner out of an
// open Admin/Permissions section on every team-space switch (the switch drops
// the capabilities query, so the null window is deterministic) and raced the
// create-team toast's `openSettings("organization")`.
describe("settingsSectionGate", () => {
  const gate = (
    section: Parameters<typeof settingsSectionGate>[0],
    over: {
      showOrganization?: boolean;
      showAiModels?: boolean;
      ready?: boolean;
    } = {},
  ) =>
    settingsSectionGate(section, {
      showOrganization: over.showOrganization ?? true,
      showAiModels: over.showAiModels ?? true,
      ready: over.ready ?? true,
    });

  it("RETAINS a gated section while the gates are still loading", () => {
    for (const id of ["organization", "permissions", "usage"] as const) {
      // Even with every gate reading false (the null-capabilities shape), an
      // unresolved gate must not decide.
      strictEqual(
        gate(id, {
          ready: false,
          showOrganization: false,
          showAiModels: false,
        }),
        "loading",
        id,
      );
    }
  });

  it("DROPS a gated section once the gates resolve against it", () => {
    strictEqual(gate("organization", { showOrganization: false }), "blocked");
    strictEqual(gate("permissions", { showOrganization: false }), "blocked");
    strictEqual(gate("usage", { showAiModels: false }), "blocked");
  });

  it("RENDERS a gated section once the gates resolve for it", () => {
    strictEqual(gate("organization"), "visible");
    strictEqual(gate("permissions"), "visible");
    strictEqual(gate("usage"), "visible");
  });

  it("never makes an ungated section wait, even before the gates resolve", () => {
    for (const id of [
      "profile",
      "apiKeys",
      "workspaceContext",
      "userContext",
      "shortcuts",
      "reportBug",
      "migration",
    ] as const) {
      strictEqual(
        gate(id, {
          ready: false,
          showOrganization: false,
          showAiModels: false,
        }),
        "visible",
        id,
      );
    }
  });
});

describe("settingsSectionNeedsWorkspace", () => {
  it("exempts the three moved surfaces (HOU-788)", () => {
    // They read org/billing/usage, never GET /v1/workspaces, and as top-level
    // views they rendered with no workspace gate. Moving them into Settings
    // must not hand them a precondition they never had.
    for (const id of ["usage", "permissions", "organization"] as const) {
      strictEqual(settingsSectionNeedsWorkspace(id), false, id);
    }
  });

  it("keeps the gate for every pre-existing section", () => {
    for (const id of [
      "profile",
      "apiKeys",
      "workspaceContext",
      "userContext",
      "shortcuts",
      "reportBug",
      "migration",
    ] as const) {
      strictEqual(settingsSectionNeedsWorkspace(id), true, id);
    }
  });
});
