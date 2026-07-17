import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, Capabilities, OrgMember } from "@houston-ai/engine-client";
import {
  canMemberBeManager,
  memberActionNeedsConfirm,
  memberAgentAccess,
  writeMemberAssignment,
} from "../src/components/organization/member-detail-model.ts";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  multiplayer: true,
  ...over,
});

const owner: Capabilities = caps({ role: "owner" });
const adminCaps: Capabilities = caps({ role: "admin" });

const agent = (over: Partial<Agent>): Agent => ({
  id: over.id ?? "a",
  name: over.name ?? "Agent",
  folderPath: over.id ?? "a",
  configId: "houston",
  createdAt: "2024-01-01T00:00:00.000Z",
  ...over,
});

const member = (over: Partial<OrgMember> = {}): OrgMember => ({
  userId: over.userId ?? "u-bob",
  email: over.email,
  role: over.role ?? "user",
});

describe("memberAgentAccess (the inversion)", () => {
  it("splits everyone-agents from explicit-roster agents", () => {
    const everyoneAgent = agent({
      id: "e",
      assignedUserIds: [],
      assignments: [],
    });
    const explicitAgent = agent({
      id: "x",
      assignedUserIds: ["u-bob"],
      assignments: [{ userId: "u-bob", access: "user" }],
    });
    const { everyone, explicit } = memberAgentAccess(
      member(),
      [everyoneAgent, explicitAgent],
      owner,
    );
    deepStrictEqual(
      everyone.map((r) => r.agent.id),
      ["e"],
    );
    deepStrictEqual(
      explicit.map((r) => r.agent.id),
      ["x"],
    );
  });

  it("reads the member's level from the roster, none when absent", () => {
    const agents = [
      agent({
        id: "x",
        assignedUserIds: ["u-bob"],
        assignments: [{ userId: "u-bob", access: "manager" }],
      }),
      agent({ id: "y", assignedUserIds: ["u-cara"], assignments: [] }),
    ];
    const { explicit } = memberAgentAccess(member(), agents, owner);
    strictEqual(explicit.find((r) => r.agent.id === "x")?.access, "manager");
    strictEqual(explicit.find((r) => r.agent.id === "y")?.access, "none");
  });

  it("an org owner is manager on every agent", () => {
    const { explicit } = memberAgentAccess(
      member({ userId: "u-self", role: "owner" }),
      [agent({ id: "x", assignedUserIds: ["u-bob"], assignments: [] })],
      owner,
    );
    strictEqual(explicit[0].access, "manager");
  });

  it("withholds the level (unknown) when the viewer can't read the roster", () => {
    // A non-owner admin over an agent they don't manage: no assignments on the
    // wire, and `access:"user"` means they can't edit → unknown, read-only.
    const hidden = agent({ id: "x", access: "user" });
    const { explicit } = memberAgentAccess(member(), [hidden], adminCaps);
    strictEqual(explicit[0].access, "unknown");
    strictEqual(explicit[0].canEdit, false);
  });

  it("marks canEdit from the viewer's per-agent authority", () => {
    // A non-empty roster keeps both in the explicit bucket (an empty assignee
    // set is the everyone sentinel).
    const roster = [{ userId: "u-cara", access: "user" as const }];
    const managed = agent({
      id: "x",
      access: "manager",
      assignedUserIds: ["u-cara"],
      assignments: roster,
    });
    const used = agent({
      id: "y",
      access: "user",
      assignedUserIds: ["u-cara"],
      assignments: roster,
    });
    const { explicit } = memberAgentAccess(
      member(),
      [managed, used],
      adminCaps,
    );
    strictEqual(explicit.find((r) => r.agent.id === "x")?.canEdit, true);
    strictEqual(explicit.find((r) => r.agent.id === "y")?.canEdit, false);
  });
});

describe("writeMemberAssignment (the set-replace write)", () => {
  const base = agent({
    id: "x",
    assignedUserIds: ["u-self", "u-bob"],
    assignments: [
      { userId: "u-self", access: "manager" },
      { userId: "u-bob", access: "user" },
    ],
  });

  it("grants a member not yet on the roster (none → user)", () => {
    const next = writeMemberAssignment(
      agent({
        id: "x",
        assignedUserIds: ["u-self"],
        assignments: [{ userId: "u-self", access: "manager" }],
      }),
      member(),
      "user",
    );
    deepStrictEqual(next, [
      { userId: "u-self", access: "manager" },
      { userId: "u-bob", access: "user" },
    ]);
  });

  it("changes an existing member's level (user → manager) without duplicating", () => {
    const next = writeMemberAssignment(base, member(), "manager");
    deepStrictEqual(next, [
      { userId: "u-self", access: "manager" },
      { userId: "u-bob", access: "manager" },
    ]);
  });

  it("removes a member, keeping the rest", () => {
    const next = writeMemberAssignment(base, member(), "remove");
    deepStrictEqual(next, [{ userId: "u-self", access: "manager" }]);
  });

  it("never strips the org owner on remove", () => {
    const next = writeMemberAssignment(
      base,
      member({ userId: "u-self", role: "owner" }),
      "remove",
    );
    deepStrictEqual(next, [
      { userId: "u-self", access: "manager" },
      { userId: "u-bob", access: "user" },
    ]);
  });
});

describe("memberActionNeedsConfirm (self-lockout gate)", () => {
  it("confirms when the viewer demotes/removes their own row", () => {
    const self = member({ userId: "u-self", role: "admin" });
    strictEqual(
      memberActionNeedsConfirm({
        member: self,
        selfId: "u-self",
        action: "remove",
      }),
      true,
    );
    strictEqual(
      memberActionNeedsConfirm({
        member: self,
        selfId: "u-self",
        action: "user",
      }),
      true,
    );
  });

  it("does not confirm promoting self, or acting on another member", () => {
    const self = member({ userId: "u-self", role: "admin" });
    strictEqual(
      memberActionNeedsConfirm({
        member: self,
        selfId: "u-self",
        action: "manager",
      }),
      false,
    );
    strictEqual(
      memberActionNeedsConfirm({
        member: member(),
        selfId: "u-self",
        action: "remove",
      }),
      false,
    );
  });

  it("never confirms for the org owner (authority is always kept)", () => {
    strictEqual(
      memberActionNeedsConfirm({
        member: member({ userId: "u-self", role: "owner" }),
        selfId: "u-self",
        action: "remove",
      }),
      false,
    );
  });
});

describe("canMemberBeManager", () => {
  it("only org owner/admin may hold a Manager seat", () => {
    strictEqual(canMemberBeManager("owner"), true);
    strictEqual(canMemberBeManager("admin"), true);
    strictEqual(canMemberBeManager("user"), false);
  });
});
