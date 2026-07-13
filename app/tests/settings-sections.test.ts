import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { parseSettingsSection } from "../src/lib/settings-sections.ts";

describe("parseSettingsSection", () => {
  it("passes a valid section id through", () => {
    strictEqual(parseSettingsSection("connectedAccounts"), "connectedAccounts");
    strictEqual(parseSettingsSection("members"), "members");
    strictEqual(parseSettingsSection("reportBug"), "reportBug");
  });

  it("rejects an unknown string as null", () => {
    strictEqual(parseSettingsSection("nope"), null);
    strictEqual(parseSettingsSection("integrations"), null);
    strictEqual(parseSettingsSection(""), null);
  });

  it("maps null to null", () => {
    strictEqual(parseSettingsSection(null), null);
  });
});
