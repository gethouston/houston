import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import { connectAffordance } from "../src/components/settings/connected-accounts-model.ts";
import { parseSettingsSection } from "../src/lib/settings-sections.ts";

const SINGLE_PLAYER: Capabilities = {};
const NON_TEAMS_MULTIPLAYER: Capabilities = { multiplayer: true, role: "user" };
const TEAMS_OWNER: Capabilities = {
  multiplayer: true,
  teams: true,
  role: "owner",
};
const TEAMS_MEMBER: Capabilities = {
  multiplayer: true,
  teams: true,
  role: "user",
};

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

describe("connectAffordance", () => {
  it("offers the catalog link in single-player", () => {
    strictEqual(connectAffordance(SINGLE_PLAYER), "link");
    strictEqual(connectAffordance(null), "link");
    strictEqual(connectAffordance(undefined), "link");
  });

  it("offers the link in non-Teams multiplayer (catalog page still exists)", () => {
    strictEqual(connectAffordance(NON_TEAMS_MULTIPLAYER), "link");
  });

  it("shows a hint on a Teams host, where the global page carries no catalog", () => {
    strictEqual(connectAffordance(TEAMS_OWNER), "hint");
  });

  it("shows a hint to a Teams member who cannot see the policy page", () => {
    strictEqual(connectAffordance(TEAMS_MEMBER), "hint");
  });
});
