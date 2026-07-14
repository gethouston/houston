import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { parseSettingsSection } from "../src/lib/settings-sections.ts";

describe("parseSettingsSection", () => {
  it("passes a valid section id through", () => {
    strictEqual(parseSettingsSection("connectedAccounts"), "connectedAccounts");
    strictEqual(parseSettingsSection("reportBug"), "reportBug");
  });

  it("rejects an unknown string as null", () => {
    strictEqual(parseSettingsSection("nope"), null);
    strictEqual(parseSettingsSection("integrations"), null);
    strictEqual(parseSettingsSection(""), null);
    // "members" was removed with the Settings > Members surface (the Admin
    // People tab is now the canonical home); a stale deep-link must not land.
    strictEqual(parseSettingsSection("members"), null);
  });

  it("maps null to null", () => {
    strictEqual(parseSettingsSection(null), null);
  });
});
