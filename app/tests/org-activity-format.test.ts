import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { AuditEntry } from "@houston-ai/engine-client";
import {
  type AuditResolvers,
  formatAuditEntry,
} from "../src/components/organization/org-activity-format.ts";

/** Deterministic fake resolvers so the mapping is asserted in isolation. */
const R: AuditResolvers = {
  actor: "Maria",
  agent: "Sales Agent",
  member: (id) => `member:${id}`,
  role: (role) => `role:${role}`,
  apps: (tks) => tks.join(" and "),
};

function entry(action: string, subject: unknown): AuditEntry {
  return { id: 1, orgId: "o", actor: "u1", action, subject, createdAt: 0 };
}

describe("org activity formatter", () => {
  it("member.add — names the added person and their role", () => {
    deepStrictEqual(
      formatAuditEntry(
        entry("member.add", { email: "carlos@acme.com", role: "user" }),
        R,
      ),
      {
        action: "memberAdd",
        vars: { actor: "Maria", name: "carlos@acme.com", role: "role:user" },
      },
    );
  });

  it("member.add — falls back to member resolver when no email", () => {
    deepStrictEqual(
      formatAuditEntry(entry("member.add", { userId: "u9", role: "admin" }), R)
        .vars.name,
      "member:u9",
    );
  });

  it("member.remove", () => {
    deepStrictEqual(
      formatAuditEntry(entry("member.remove", { userId: "u9" }), R),
      {
        action: "memberRemove",
        vars: { actor: "Maria", name: "member:u9" },
      },
    );
  });

  it("member.role", () => {
    deepStrictEqual(
      formatAuditEntry(
        entry("member.role", { userId: "u9", role: "admin" }),
        R,
      ),
      {
        action: "memberRole",
        vars: { actor: "Maria", name: "member:u9", role: "role:admin" },
      },
    );
  });

  it("invite.create", () => {
    deepStrictEqual(
      formatAuditEntry(
        entry("invite.create", { email: "carlos@acme.com", role: "user" }),
        R,
      ),
      {
        action: "inviteCreate",
        vars: { actor: "Maria", email: "carlos@acme.com", role: "role:user" },
      },
    );
  });

  it("invite.revoke", () => {
    deepStrictEqual(
      formatAuditEntry(entry("invite.revoke", { email: "x@y.com" }), R),
      {
        action: "inviteRevoke",
        vars: { actor: "Maria", email: "x@y.com" },
      },
    );
  });

  it("invite.accept", () => {
    deepStrictEqual(
      formatAuditEntry(entry("invite.accept", { role: "user" }), R),
      {
        action: "inviteAccept",
        vars: { actor: "Maria", role: "role:user" },
      },
    );
  });

  it("agent.create", () => {
    deepStrictEqual(formatAuditEntry(entry("agent.create", {}), R), {
      action: "agentCreate",
      vars: { actor: "Maria", agent: "Sales Agent" },
    });
  });

  it("agent.rename — uses subject from/to, falls back to agent name", () => {
    deepStrictEqual(
      formatAuditEntry(entry("agent.rename", { from: "Old", to: "New" }), R),
      {
        action: "agentRename",
        vars: { actor: "Maria", from: "Old", to: "New" },
      },
    );
    deepStrictEqual(formatAuditEntry(entry("agent.rename", {}), R).vars, {
      actor: "Maria",
      from: "Sales Agent",
      to: "Sales Agent",
    });
  });

  it("agent.delete", () => {
    deepStrictEqual(formatAuditEntry(entry("agent.delete", {}), R), {
      action: "agentDelete",
      vars: { actor: "Maria", agent: "Sales Agent" },
    });
  });

  it("agent.assignments — generic without a count, plural with one", () => {
    deepStrictEqual(formatAuditEntry(entry("agent.assignments", {}), R), {
      action: "agentAssignments",
      vars: { actor: "Maria", agent: "Sales Agent" },
    });
    deepStrictEqual(
      formatAuditEntry(entry("agent.assignments", { count: 3 }), R),
      {
        action: "agentShared",
        vars: { actor: "Maria", agent: "Sales Agent", count: 3 },
      },
    );
  });

  it("agent.settings", () => {
    deepStrictEqual(formatAuditEntry(entry("agent.settings", {}), R), {
      action: "agentSettings",
      vars: { actor: "Maria", agent: "Sales Agent" },
    });
  });

  it("org.settings", () => {
    deepStrictEqual(formatAuditEntry(entry("org.settings", {}), R), {
      action: "orgSettings",
      vars: { actor: "Maria" },
    });
  });

  it("grants.set — joins app names (toolkits array or single toolkit)", () => {
    deepStrictEqual(
      formatAuditEntry(
        entry("grants.set", { toolkits: ["gmail", "slack"] }),
        R,
      ),
      {
        action: "grantsSet",
        vars: { actor: "Maria", agent: "Sales Agent", apps: "gmail and slack" },
      },
    );
    deepStrictEqual(
      formatAuditEntry(entry("grants.set", { toolkit: "gmail" }), R).vars.apps,
      "gmail",
    );
  });

  it("agent.configure", () => {
    deepStrictEqual(
      formatAuditEntry(
        entry("agent.configure", { path: "config", method: "PUT" }),
        R,
      ),
      {
        action: "agentConfigure",
        vars: { actor: "Maria", agent: "Sales Agent" },
      },
    );
  });

  it("unknown action → fallback sentence carrying the raw action", () => {
    deepStrictEqual(formatAuditEntry(entry("something.new", {}), R), {
      action: "unknown",
      vars: { actor: "Maria", action: "something.new" },
    });
  });

  it("never throws on a malformed subject", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      formatAuditEntry(entry("member.add", bad), R);
      formatAuditEntry(entry("grants.set", bad), R);
    }
  });
});
