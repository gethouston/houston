import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import {
  canCreateAgents,
  canEditAgentGrants,
  canManageAgentGrants,
  canManageAssignments,
  canManageMembers,
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

describe("canManageAssignments", () => {
  it("owner manages any agent regardless of assignment", () => {
    strictEqual(
      canManageAssignments(multiplayer("owner"), { assigned: false }),
      true,
    );
    strictEqual(
      canManageAssignments(multiplayer("owner"), { assigned: true }),
      true,
    );
  });

  it("admin manages only agents they are assigned to", () => {
    strictEqual(
      canManageAssignments(multiplayer("admin"), { assigned: true }),
      true,
    );
    strictEqual(
      canManageAssignments(multiplayer("admin"), { assigned: false }),
      false,
    );
  });

  it("plain user never manages assignments; single-player never sees the block", () => {
    strictEqual(
      canManageAssignments(multiplayer("user"), { assigned: true }),
      false,
    );
    strictEqual(canManageAssignments(caps(), { assigned: true }), false);
  });
});

describe("canManageAgentGrants", () => {
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

describe("canEditAgentGrants", () => {
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
