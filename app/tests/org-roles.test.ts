import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import {
  canCreateAgents,
  canEditAgentConfig,
  canEditAgentGrants,
  canManageAgentGrants,
  canManageAssignments,
  canManageMembers,
  canSeeBilling,
  canSeeBillingTab,
  canSeeMembers,
  GRANTABLE_ROLES,
  isAgentManager,
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

// Per-agent effective access (contract §0). Defined locally: the wire type
// lives on `Agent.access` (engine-client), added alongside this work; the tests
// only need the value union.
type AgentAccess = "manager" | "user";

const ROLES: readonly OrgRole[] = ["owner", "admin", "user"] as const;
const ACCESSES: readonly (AgentAccess | undefined)[] = [
  "manager",
  "user",
  undefined,
] as const;

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

describe("isAgentManager (matrix v2)", () => {
  it("single-player is always an agent-manager regardless of access", () => {
    // No org => the sole user owns everything; access is absent on the wire.
    for (const access of ACCESSES) {
      strictEqual(isAgentManager(caps(), { access }), true);
      strictEqual(isAgentManager(null, { access }), true);
    }
  });

  it("multiplayer owner is an agent-manager of every agent", () => {
    for (const access of ACCESSES) {
      strictEqual(isAgentManager(multiplayer("owner"), { access }), true);
    }
  });

  it("multiplayer non-owner defers purely to effective access", () => {
    // admin and user alike: only access='manager' grants manager authority.
    // Matrix v2 dropped the admin "manages all" rule.
    for (const role of ["admin", "user"] as const) {
      strictEqual(
        isAgentManager(multiplayer(role), { access: "manager" }),
        true,
      );
      strictEqual(isAgentManager(multiplayer(role), { access: "user" }), false);
      strictEqual(
        isAgentManager(multiplayer(role), { access: undefined }),
        false,
      );
    }
  });

  it("purely trusts agent.access — the gateway already clamped it", () => {
    // A role-`user` carrying access='manager' does NOT occur on the wire: the
    // gateway clamps a stale manager row to the org role before sending it.
    // The client trusts the (already-effective) access rather than re-clamping,
    // so this synthetic combination returns true — documenting the boundary.
    strictEqual(
      isAgentManager(multiplayer("user"), { access: "manager" }),
      true,
    );
  });

  it("exhaustive role x access matrix", () => {
    const expected = (role: OrgRole, access?: AgentAccess): boolean =>
      role === "owner" || access === "manager";
    for (const role of ROLES) {
      for (const access of ACCESSES) {
        strictEqual(
          isAgentManager(multiplayer(role), { access }),
          expected(role, access),
          `role=${role} access=${access}`,
        );
      }
    }
  });
});

describe("canEditAgentConfig", () => {
  it("is the isAgentManager gate (same reference)", () => {
    strictEqual(canEditAgentConfig, isAgentManager);
  });

  it("gates config edits (instructions/skills/model/settings) by manager authority", () => {
    strictEqual(canEditAgentConfig(caps(), { access: undefined }), true);
    strictEqual(
      canEditAgentConfig(multiplayer("owner"), { access: "user" }),
      true,
    );
    strictEqual(
      canEditAgentConfig(multiplayer("admin"), { access: "manager" }),
      true,
    );
    strictEqual(
      canEditAgentConfig(multiplayer("admin"), { access: "user" }),
      false,
    );
    strictEqual(
      canEditAgentConfig(multiplayer("user"), { access: "user" }),
      false,
    );
  });
});

describe("canManageAssignments (agent-manager semantics)", () => {
  it("mirrors isAgentManager across the full matrix", () => {
    for (const role of ROLES) {
      for (const access of ACCESSES) {
        strictEqual(
          canManageAssignments(multiplayer(role), { access }),
          isAgentManager(multiplayer(role), { access }),
          `role=${role} access=${access}`,
        );
      }
    }
  });

  it("owner manages any agent; managers manage their agent; others cannot", () => {
    strictEqual(
      canManageAssignments(multiplayer("owner"), { access: "user" }),
      true,
    );
    strictEqual(
      canManageAssignments(multiplayer("admin"), { access: "manager" }),
      true,
    );
    // Admin who merely uses an agent (access='user') can no longer share it.
    strictEqual(
      canManageAssignments(multiplayer("admin"), { access: "user" }),
      false,
    );
    strictEqual(
      canManageAssignments(multiplayer("user"), { access: "user" }),
      false,
    );
    // Single-player never renders the share block, but the gate is permissive.
    strictEqual(canManageAssignments(caps(), { access: undefined }), true);
  });
});

describe("canManageAgentGrants (own-grants, assignment semantics)", () => {
  it("requires multiplayer assignment for every role", () => {
    strictEqual(
      canManageAgentGrants(multiplayer("owner"), { assigned: true }),
      true,
    );
    strictEqual(
      canManageAgentGrants(multiplayer("owner"), { assigned: false }),
      false,
    );
    strictEqual(
      canManageAgentGrants(multiplayer("admin"), { assigned: true }),
      true,
    );
    strictEqual(
      canManageAgentGrants(multiplayer("user"), { assigned: true }),
      true,
    );
    strictEqual(canManageAgentGrants(caps(), { assigned: true }), false);
  });
});

describe("canEditAgentGrants (own-grants, assignment semantics)", () => {
  it("single-player can always edit its own agent's grants (regression)", () => {
    // A self-host / local sidecar serves grants but has no org roles; the tab
    // must stay editable there, not fall read-only.
    strictEqual(canEditAgentGrants(caps(), { assigned: true }), true);
    strictEqual(canEditAgentGrants(caps(), { assigned: false }), true);
    strictEqual(canEditAgentGrants(null, { assigned: false }), true);
  });

  it("multiplayer defers to the assignment rule", () => {
    strictEqual(
      canEditAgentGrants(multiplayer("admin"), { assigned: true }),
      true,
    );
    strictEqual(
      canEditAgentGrants(multiplayer("user"), { assigned: false }),
      false,
    );
  });
});

describe("grantable roles", () => {
  it("owner is never grantable from the UI", () => {
    deepStrictEqual([...GRANTABLE_ROLES], ["admin", "user"]);
  });
});
