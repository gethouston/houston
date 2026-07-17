import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import {
  canEditAgentConfig,
  canManageAssignments,
  isAgentManager,
} from "../src/lib/agent-access.ts";

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
