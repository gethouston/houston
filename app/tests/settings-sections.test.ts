import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  parseSettingsSection,
  SETTINGS_SECTION_IDS,
  settingsLandingSection,
  settingsSectionAvailable,
  settingsSectionFromDeepLink,
  settingsSectionFromPath,
} from "../src/lib/settings-sections.ts";

describe("SETTINGS_SECTION_IDS", () => {
  it("is the exact section set: the standing setup, nothing else", () => {
    deepStrictEqual(
      [...SETTINGS_SECTION_IDS],
      [
        "profile",
        "plan",
        "aboutMe",
        "apiKeys",
        "channels",
        "shortcuts",
        "reportBug",
        "migration",
      ],
    );
  });
});

describe("billing deep links", () => {
  it("accepts only known settings sections", () => {
    strictEqual(settingsSectionFromPath("/settings/plan"), "plan");
    strictEqual(settingsSectionFromPath("/settings/reportBug"), "reportBug");
    strictEqual(settingsSectionFromPath("/settings/unknown"), null);
    strictEqual(settingsSectionFromPath("/settings/plan/extra"), null);
    strictEqual(settingsSectionFromDeepLink("houston://settings/plan"), "plan");
    strictEqual(
      settingsSectionFromDeepLink("houston://settings/unknown"),
      null,
    );
    strictEqual(
      settingsSectionFromDeepLink("https://example.com/settings/plan"),
      null,
    );
  });

  it("opens only Billing from an OS deep link", () => {
    strictEqual(
      settingsSectionFromDeepLink("houston://settings/plan/"),
      "plan",
    );
    strictEqual(
      settingsSectionFromDeepLink("houston://settings/reportBug"),
      null,
    );
    strictEqual(
      settingsSectionFromDeepLink("houston://settings/profile"),
      null,
    );
  });
});

describe("settingsSectionAvailable", () => {
  it("shows Billing only where the deployment serves the personal plan", () => {
    strictEqual(settingsSectionAvailable("plan", { plan: true }), true);
    strictEqual(settingsSectionAvailable("plan", { plan: false }), false);
    strictEqual(settingsSectionAvailable("plan", {}), false);
    strictEqual(settingsSectionAvailable("plan", undefined), false);
    strictEqual(settingsSectionAvailable("profile", undefined), true);
  });
});

describe("settingsLandingSection", () => {
  it("lands a Billing link on the index where the plan is not served", () => {
    strictEqual(settingsLandingSection("plan", { plan: false }), null);
    strictEqual(settingsLandingSection("plan", null), null);
    strictEqual(settingsLandingSection("plan", { plan: true }), "plan");
  });

  it("lands every other section as linked", () => {
    strictEqual(settingsLandingSection("reportBug", null), "reportBug");
  });
});

describe("parseSettingsSection", () => {
  it("passes a valid section id through", () => {
    strictEqual(parseSettingsSection("profile"), "profile");
    strictEqual(parseSettingsSection("plan"), "plan");
    strictEqual(parseSettingsSection("aboutMe"), "aboutMe");
    strictEqual(parseSettingsSection("apiKeys"), "apiKeys");
    strictEqual(parseSettingsSection("channels"), "channels");
    strictEqual(parseSettingsSection("reportBug"), "reportBug");
  });

  it("rejects an unknown string as null", () => {
    strictEqual(parseSettingsSection("nope"), null);
    strictEqual(parseSettingsSection("integrations"), null);
    strictEqual(parseSettingsSection(""), null);
    // Integrations owns connected accounts; a stale Settings deep link cannot land.
    strictEqual(parseSettingsSection("connectedAccounts"), null);
    // Admin's People section owns the roster; a stale Settings link cannot land.
    strictEqual(parseSettingsSection("members"), null);
    // Admin is a top-level screen, Time worked a lens inside it, and agent
    // policy a team's focused agent screen. The company
    // half of the standing context is an Admin section: a stale pin on any of
    // them must fall back rather than land. The `about-me` VIEW id an older
    // install may have pinned is not a section id either: the section is
    // `aboutMe`.
    strictEqual(parseSettingsSection("timeWorked"), null);
    strictEqual(parseSettingsSection("organization"), null);
    strictEqual(parseSettingsSection("workspace"), null);
    // The shared Skills library is a TOP-LEVEL view, not a Settings section:
    // neither the old section id nor the view id may resolve here, or a stale
    // pin would open Settings on a section that does not exist.
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

describe("useSettingsLanding source", () => {
  // The node runner has no DOM, so the hook's wiring is guarded on its source.
  const src = readFileSync(
    new URL("../src/hooks/use-settings-landing.ts", import.meta.url),
    "utf8",
  );

  it("opens every linked section through the capability-aware landing", () => {
    strictEqual(/openSettings\(\s*pendingPath\.current/.test(src), false);
    strictEqual(/openSettings\(section\)/.test(src), false);
    ok(src.includes("settingsLandingSection("));
  });

  it("waits for the capabilities before landing", () => {
    ok(src.includes("useCapabilities()"));
    ok(/ready\.current =[^;]*!capabilitiesLoading/.test(src));
  });
});
