import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  parseSettingsSection,
  SETTINGS_SECTION_IDS,
} from "../src/lib/settings-sections.ts";

describe("SETTINGS_SECTION_IDS", () => {
  it("is the exact section set: the standing setup, nothing else", () => {
    // Everything a person adjusts rather than works in, Workspace management
    // (which administers the SPACE) included.
    deepStrictEqual(
      [...SETTINGS_SECTION_IDS],
      [
        "profile",
        "aboutMe",
        "workspace",
        "apiKeys",
        "channels",
        "shortcuts",
        "reportBug",
        "migration",
      ],
    );
  });
});

describe("parseSettingsSection", () => {
  it("passes a valid section id through", () => {
    strictEqual(parseSettingsSection("profile"), "profile");
    strictEqual(parseSettingsSection("aboutMe"), "aboutMe");
    strictEqual(parseSettingsSection("apiKeys"), "apiKeys");
    strictEqual(parseSettingsSection("channels"), "channels");
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
    // Time worked, Admin and Permissions are reached without a section id of
    // their own (Admin is the `workspace` section, Time worked a lens inside
    // it, and agent policy a team's focused agent screen), and the company
    // half of the standing context is an Admin section: a stale pin on any of
    // them must fall back rather than land. The `about-me` VIEW id an older
    // install may have pinned is not a section id either: the section is
    // `aboutMe`.
    strictEqual(parseSettingsSection("timeWorked"), null);
    strictEqual(parseSettingsSection("organization"), null);
    strictEqual(parseSettingsSection("workspace"), "workspace");
    // The shared Skills library is a TAB of the Integrations screen, not a
    // section: neither the old section id nor the older top-level view id may
    // land a stale pin on a screen that no longer exists.
    strictEqual(parseSettingsSection("skills"), null);
    strictEqual(parseSettingsSection("skills-home"), null);
    strictEqual(parseSettingsSection("permissions"), null);
    strictEqual(parseSettingsSection("workspaceContext"), null);
    strictEqual(parseSettingsSection("userContext"), null);
    strictEqual(parseSettingsSection("about-me"), null);
  });

  it("maps null to null", () => {
    strictEqual(parseSettingsSection(null), null);
  });
});
