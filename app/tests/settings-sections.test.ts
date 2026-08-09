import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  parseSettingsSection,
  SETTINGS_SECTION_IDS,
} from "../src/lib/settings-sections.ts";

describe("SETTINGS_SECTION_IDS", () => {
  it("is the exact section set: the user's own app, nothing else", () => {
    // Admin and Permissions left for the rail's "Workspace" band, which is what
    // removed the last GATED section — with the set below there is no section
    // gate, no tri-state loading rule and no workspace opt-out to keep.
    deepStrictEqual(
      [...SETTINGS_SECTION_IDS],
      ["profile", "apiKeys", "shortcuts", "reportBug", "migration"],
    );
  });
});

describe("parseSettingsSection", () => {
  it("passes a valid section id through", () => {
    strictEqual(parseSettingsSection("profile"), "profile");
    strictEqual(parseSettingsSection("apiKeys"), "apiKeys");
    strictEqual(parseSettingsSection("reportBug"), "reportBug");
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
    // Time worked, Admin and Permissions are TOP-LEVEL views, and the context
    // editors moved to the Inbox's Context surface: all of them are reached
    // without Settings, so a stale pin must fall back rather than land.
    strictEqual(parseSettingsSection("timeWorked"), null);
    strictEqual(parseSettingsSection("organization"), null);
    strictEqual(parseSettingsSection("permissions"), null);
    strictEqual(parseSettingsSection("workspaceContext"), null);
    strictEqual(parseSettingsSection("userContext"), null);
  });

  it("maps null to null", () => {
    strictEqual(parseSettingsSection(null), null);
  });
});
