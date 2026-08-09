import { deepStrictEqual, notStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import { canSeeBilling, canSeeBillingTab } from "../src/lib/billing-gates.ts";
import {
  canCreateAgents,
  canDeleteWorkspace,
  canManageMembers,
  canSeeAiModelsPage,
  canSeeMembers,
  GRANTABLE_ROLES,
  hasAgentTeams,
  isMultiplayer,
  isSpaceOwner,
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

const teams = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role, teams: true });

describe("canSeeAiModelsPage (HOU-976)", () => {
  // Six role/deployment cases used to be spelled out here against a function
  // that now returns a constant, so not one of them could fail. The gate itself
  // needs exactly one line; what CAN regress is the SEPARATION below.
  it("is true for everyone, in every deployment", () => {
    strictEqual(canSeeAiModelsPage(teams("user")), true);
  });

  it("does not carry the owner/admin matrix that guards team consumption", () => {
    // Opening the hub (every member connects their OWN AI account there) must
    // not widen the space-wide spend surface with it: the team roll-up lives in
    // Admin > Usage, which still rides the owner/admin matrix (`canSeeMembers`,
    // through `canSeeOrganization`). Re-uniting the two would either hide the
    // hub from the member whose own account it exists to manage, or open the
    // space's spend to every member.
    strictEqual(canSeeMembers(teams("user")), false);
    notStrictEqual(
      canSeeAiModelsPage(teams("user")),
      canSeeMembers(teams("user")),
    );
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

describe("canDeleteWorkspace (PRODUCT-1247)", () => {
  it("single-player always allowed — the sole user owns every workspace", () => {
    strictEqual(canDeleteWorkspace(caps()), true);
    strictEqual(canDeleteWorkspace(null), true);
  });

  it("multiplayer: owner only — admin ('Manager' in the UI) and user cannot", () => {
    strictEqual(canDeleteWorkspace(multiplayer("owner")), true);
    strictEqual(canDeleteWorkspace(multiplayer("admin")), false);
    strictEqual(canDeleteWorkspace(multiplayer("user")), false);
  });

  it("multiplayer without an explicit role denies (least privilege)", () => {
    strictEqual(canDeleteWorkspace(caps({ multiplayer: true })), false);
  });
});

describe("isSpaceOwner", () => {
  const withSpaces = (role: OrgRole): Capabilities =>
    caps({ multiplayer: true, role, spaces: true });

  it("single player owns the space, whatever the active-space flag says", () => {
    strictEqual(isSpaceOwner(caps(), false), true);
    strictEqual(isSpaceOwner(caps(), true), true);
    strictEqual(isSpaceOwner(null, false), true);
    strictEqual(isSpaceOwner(undefined, false), true);
  });

  it("a C8 personal space belongs to its one human, whatever the org role", () => {
    strictEqual(isSpaceOwner(withSpaces("owner"), false), true);
    strictEqual(isSpaceOwner(withSpaces("admin"), false), true);
    strictEqual(isSpaceOwner(withSpaces("user"), false), true);
  });

  it("a multiplayer team space: the owner owns it", () => {
    strictEqual(isSpaceOwner(withSpaces("owner"), true), true);
    strictEqual(isSpaceOwner(multiplayer("owner"), true), true);
  });

  it("an admin RUNS a team space but does not own it", () => {
    strictEqual(isSpaceOwner(withSpaces("admin"), true), false);
    strictEqual(isSpaceOwner(multiplayer("admin"), true), false);
  });

  it("a plain member never owns it", () => {
    strictEqual(isSpaceOwner(withSpaces("user"), true), false);
    strictEqual(isSpaceOwner(multiplayer("user"), true), false);
  });

  it("multiplayer without spaces is never personal, so the role decides", () => {
    // No `spaces` capability means no personal/team split at all: the
    // active-space flag is meaningless and must not grant ownership.
    strictEqual(isSpaceOwner(multiplayer("admin"), false), false);
    strictEqual(isSpaceOwner(multiplayer("user"), false), false);
    strictEqual(isSpaceOwner(multiplayer("owner"), false), true);
  });

  it("multiplayer without an explicit role denies (least privilege)", () => {
    strictEqual(isSpaceOwner(caps({ multiplayer: true }), true), false);
  });
});

describe("hasAgentTeams (C13 feature-detect)", () => {
  it("true only when the host advertises the surface", () => {
    strictEqual(hasAgentTeams(caps({ agentTeams: true })), true);
  });

  it("false when the host advertises it as off", () => {
    strictEqual(hasAgentTeams(caps({ agentTeams: false })), false);
  });

  it("absent means the LOCAL backend — desktop, self-host, pre-C13 gateways", () => {
    strictEqual(hasAgentTeams(caps()), false);
  });

  it("no capabilities at all is the local backend too", () => {
    strictEqual(hasAgentTeams(null), false);
    strictEqual(hasAgentTeams(undefined), false);
  });
});

describe("grantable roles", () => {
  it("owner is never grantable from the UI", () => {
    deepStrictEqual([...GRANTABLE_ROLES], ["admin", "user"]);
  });
});
