import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import {
  canCreateAgents,
  canManageMembers,
  canSeeAiModelsPage,
  canSeeBilling,
  canSeeBillingTab,
  canSeeMembers,
  GRANTABLE_ROLES,
  isMultiplayer,
  orgRole,
} from "../src/lib/org-roles.ts";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  ...over,
});

const multiplayer = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role });

describe("isMultiplayer / orgRole", () => {
  it("single-player: no org, no role", () => {
    strictEqual(isMultiplayer(caps()), false);
    strictEqual(isMultiplayer(null), false);
    strictEqual(orgRole(caps()), null);
    strictEqual(orgRole(null), null);
  });

  it("multiplayer without an explicit role defaults to least-privileged user", () => {
    strictEqual(isMultiplayer(caps({ multiplayer: true })), true);
    strictEqual(orgRole(caps({ multiplayer: true })), "user");
  });

  it("multiplayer surfaces the advertised role", () => {
    strictEqual(orgRole(multiplayer("owner")), "owner");
    strictEqual(orgRole(multiplayer("admin")), "admin");
    strictEqual(orgRole(multiplayer("user")), "user");
  });
});

describe("canCreateAgents", () => {
  it("single-player always allowed", () => {
    strictEqual(canCreateAgents(caps()), true);
    strictEqual(canCreateAgents(null), true);
  });

  it("owner and admin can create, plain user cannot", () => {
    strictEqual(canCreateAgents(multiplayer("owner")), true);
    strictEqual(canCreateAgents(multiplayer("admin")), true);
    strictEqual(canCreateAgents(multiplayer("user")), false);
  });
});

describe("canSeeMembers / canManageMembers", () => {
  it("owner and admin see the roster; user does not", () => {
    strictEqual(canSeeMembers(multiplayer("owner")), true);
    strictEqual(canSeeMembers(multiplayer("admin")), true);
    strictEqual(canSeeMembers(multiplayer("user")), false);
    strictEqual(canSeeMembers(caps()), false);
  });

  it("only owner may mutate members", () => {
    strictEqual(canManageMembers(multiplayer("owner")), true);
    strictEqual(canManageMembers(multiplayer("admin")), false);
    strictEqual(canManageMembers(multiplayer("user")), false);
    strictEqual(canManageMembers(caps()), false);
  });
});

describe("canSeeAiModelsPage", () => {
  const teams = (role: OrgRole): Capabilities =>
    caps({ multiplayer: true, role, teams: true });

  it("single-player keeps the AI Models hub", () => {
    strictEqual(canSeeAiModelsPage(caps()), true);
    strictEqual(canSeeAiModelsPage(null), true);
  });

  it("non-Teams multiplayer keeps it for every role", () => {
    strictEqual(canSeeAiModelsPage(multiplayer("user")), true);
  });

  it("in a Teams workspace only owner/admin see it (providers are org-level)", () => {
    strictEqual(canSeeAiModelsPage(teams("owner")), true);
    strictEqual(canSeeAiModelsPage(teams("admin")), true);
    strictEqual(canSeeAiModelsPage(teams("user")), false);
  });
});

describe("canSeeBilling (C8)", () => {
  it("owner and admin see billing; member and single-player do not", () => {
    // Admin sees the summary (read) though the owner-only checkout write 403s —
    // the admin/owner asymmetry is intended (C8 §Error codes).
    strictEqual(canSeeBilling(multiplayer("owner")), true);
    strictEqual(canSeeBilling(multiplayer("admin")), true);
    // Members NEVER see billing data (C8 §Client UX) — they read the degrade
    // banner from OrgSummary.degraded instead.
    strictEqual(canSeeBilling(multiplayer("user")), false);
    // Single-player has no billing surface at all.
    strictEqual(canSeeBilling(caps()), false);
    strictEqual(canSeeBilling(null), false);
  });
});

describe("canSeeBillingTab (C8)", () => {
  const withSpaces = (role: OrgRole): Capabilities =>
    caps({ multiplayer: true, role, spaces: true });

  it("shows Billing to owner/admin on a team space of a Spaces host", () => {
    strictEqual(canSeeBillingTab(withSpaces("owner"), true), true);
    strictEqual(canSeeBillingTab(withSpaces("admin"), true), true);
  });

  it("hides it in a personal (non-team) space", () => {
    strictEqual(canSeeBillingTab(withSpaces("owner"), false), false);
  });

  it("hides it from plain members", () => {
    strictEqual(canSeeBillingTab(withSpaces("user"), true), false);
  });

  it("hides it off a Spaces host and in single-player", () => {
    strictEqual(canSeeBillingTab(multiplayer("owner"), true), false); // no spaces flag
    strictEqual(canSeeBillingTab(caps(), true), false);
    strictEqual(canSeeBillingTab(null, true), false);
  });
});

describe("grantable roles", () => {
  it("owner is never grantable from the UI", () => {
    deepStrictEqual([...GRANTABLE_ROLES], ["admin", "user"]);
  });
});
