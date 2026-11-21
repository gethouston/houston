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
        "plan",
        "apiKeys",
        "channels",
        "morningBriefing",
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
    strictEqual(settingsSectionAvailable("channels", undefined), true);
  });

  it("shows API keys only where the deployment serves the public API", () => {
    strictEqual(settingsSectionAvailable("apiKeys", { apiKeys: true }), true);
    strictEqual(settingsSectionAvailable("apiKeys", { apiKeys: false }), false);
    strictEqual(settingsSectionAvailable("apiKeys", { plan: true }), false);
    strictEqual(settingsSectionAvailable("apiKeys", null), false);
    strictEqual(
      settingsSectionAvailable("morningBriefing", { heartbeat: true }),
      true,
    );
    strictEqual(settingsSectionAvailable("morningBriefing", {}), false);
    strictEqual(settingsSectionAvailable("morningBriefing", null), false);
  });
});

describe("settingsLandingSection", () => {
  it("lands a Billing link on the index where the plan is not served", () => {
    strictEqual(settingsLandingSection("plan", { plan: false }), null);
    strictEqual(settingsLandingSection("plan", null), null);
    strictEqual(settingsLandingSection("plan", { plan: true }), "plan");
  });

  it("lands an API-keys link on the index where the public API is not served", () => {
    strictEqual(settingsLandingSection("apiKeys", {}), null);
    strictEqual(
      settingsLandingSection("apiKeys", { apiKeys: true }),
      "apiKeys",
    );
  });

  it("lands every other section as linked", () => {
    strictEqual(settingsLandingSection("reportBug", null), "reportBug");
  });
});

describe("parseSettingsSection", () => {
  it("passes a valid section id through", () => {
    strictEqual(parseSettingsSection("plan"), "plan");
    strictEqual(parseSettingsSection("apiKeys"), "apiKeys");
    strictEqual(parseSettingsSection("channels"), "channels");
    strictEqual(parseSettingsSection("reportBug"), "reportBug");
  });

  it("rejects an unknown string as null", () => {
    strictEqual(parseSettingsSection("nope"), null);
    strictEqual(parseSettingsSection("integrations"), null);
    strictEqual(parseSettingsSection(""), null);
    strictEqual(parseSettingsSection("connectedAccounts"), null);
    strictEqual(parseSettingsSection("members"), null);
    strictEqual(parseSettingsSection("timeWorked"), null);
    strictEqual(parseSettingsSection("organization"), null);
    strictEqual(parseSettingsSection("workspace"), null);
    strictEqual(parseSettingsSection("skills"), null);
    strictEqual(parseSettingsSection("skills-home"), null);
    strictEqual(parseSettingsSection("permissions"), null);
    strictEqual(parseSettingsSection("workspaceContext"), null);
    strictEqual(parseSettingsSection("userContext"), null);
    strictEqual(parseSettingsSection("about-me"), null);
    strictEqual(parseSettingsSection("profile"), null);
    strictEqual(parseSettingsSection("aboutMe"), null);
  });

  it("maps null to null", () => {
    strictEqual(parseSettingsSection(null), null);
  });
});

describe("useSettingsLanding source", () => {
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

describe("keyboard shortcuts on a touch surface", () => {
  it("exists only where there is a keyboard", () => {
    strictEqual(settingsSectionAvailable("shortcuts", null), true);
    strictEqual(
      settingsSectionAvailable("shortcuts", null, { touch: false }),
      true,
    );
    strictEqual(
      settingsSectionAvailable("shortcuts", null, { touch: true }),
      false,
    );
    strictEqual(
      settingsSectionAvailable("reportBug", null, { touch: true }),
      true,
    );
  });

  it("the index forks on phone width or the native app, never the UA", () => {
    const src = readFileSync(
      new URL("../src/components/settings/settings-index.tsx", import.meta.url),
      "utf8",
    );
    ok(src.includes("useIsMobile() || osIsNativeMobile()"));
    ok(
      src.includes(
        'settingsSectionAvailable("shortcuts", capabilities, surface)',
      ),
    );
    strictEqual(/navigator\.userAgent/.test(src), false);
  });
});
