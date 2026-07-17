import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston-ai/engine-client";
import {
  agentPeopleView,
  agentPersonNeedsConfirm,
  buildAgentPeople,
  canPersonBeManager,
  writeAgentPerson,
} from "../src/components/permissions/agent-people-model.ts";

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

const SELF = member({
  userId: "u-self",
  email: "self@acme.test",
  role: "owner",
});
const BOB = member({ userId: "u-bob", email: "bob@acme.test", role: "user" });
const CARA = member({
  userId: "u-cara",
  email: "cara@acme.test",
  role: "admin",
});
const ROSTER = [SELF, BOB, CARA];

describe("buildAgentPeople", () => {
  it("gives every member a level; absent members are none, owner is manager", () => {
    const a = agent({
      id: "x",
      assignedUserIds: ["u-bob"],
      assignments: [{ userId: "u-bob", access: "user" }],
    });
    const rows = buildAgentPeople({
      agent: a,
      members: ROSTER,
      selfId: "u-self",
    });
    strictEqual(rows.length, 3);
    strictEqual(
      rows.find((r) => r.member.userId === "u-self")?.level,
      "manager",
    );
    strictEqual(rows.find((r) => r.member.userId === "u-bob")?.level, "user");
    strictEqual(rows.find((r) => r.member.userId === "u-cara")?.level, "none");
  });

  it("an everyone-agent shows every non-owner at can-use", () => {
    const a = agent({ id: "e", assignedUserIds: [], assignments: [] });
    const rows = buildAgentPeople({
      agent: a,
      members: ROSTER,
      selfId: "u-self",
    });
    strictEqual(rows.find((r) => r.member.userId === "u-bob")?.level, "user");
    strictEqual(rows.find((r) => r.member.userId === "u-cara")?.level, "user");
    strictEqual(
      rows.find((r) => r.member.userId === "u-self")?.level,
      "manager",
    );
  });

  it("sorts owner, then managers, then can-use, then no-access", () => {
    const a = agent({
      id: "x",
      assignedUserIds: ["u-cara"],
      assignments: [{ userId: "u-cara", access: "manager" }],
    });
    const rows = buildAgentPeople({
      agent: a,
      members: ROSTER,
      selfId: "u-self",
    });
    deepStrictEqual(
      rows.map((r) => r.member.userId),
      ["u-self", "u-cara", "u-bob"],
    );
  });

  it("flags self, owner, and manager-seat eligibility", () => {
    const a = agent({ id: "x", assignedUserIds: ["u-bob"], assignments: [] });
    const rows = buildAgentPeople({
      agent: a,
      members: ROSTER,
      selfId: "u-bob",
    });
    const bob = rows.find((r) => r.member.userId === "u-bob");
    strictEqual(bob?.isSelf, true);
    strictEqual(bob?.canBeManager, false);
    strictEqual(rows.find((r) => r.member.userId === "u-self")?.isOwner, true);
    strictEqual(
      rows.find((r) => r.member.userId === "u-cara")?.canBeManager,
      true,
    );
  });
});

describe("writeAgentPerson (set-replace write)", () => {
  const explicit = agent({
    id: "x",
    assignedUserIds: ["u-self", "u-bob"],
    assignments: [
      { userId: "u-self", access: "manager" },
      { userId: "u-bob", access: "user" },
    ],
  });

  it("grants a member not on the roster (none -> user)", () => {
    const next = writeAgentPerson({
      agent: explicit,
      members: ROSTER,
      selfId: "u-self",
      userId: "u-cara",
      action: "user",
    });
    strictEqual(
      next.some((a) => a.userId === "u-cara" && a.access === "user"),
      true,
    );
    strictEqual(next.length, 3);
  });

  it("grants Manager directly to a none member", () => {
    const next = writeAgentPerson({
      agent: explicit,
      members: ROSTER,
      selfId: "u-self",
      userId: "u-cara",
      action: "manager",
    });
    strictEqual(next.find((a) => a.userId === "u-cara")?.access, "manager");
  });

  it("changes an existing member's level without duplicating", () => {
    const next = writeAgentPerson({
      agent: explicit,
      members: ROSTER,
      selfId: "u-self",
      userId: "u-bob",
      action: "manager",
    });
    strictEqual(next.filter((a) => a.userId === "u-bob").length, 1);
    strictEqual(next.find((a) => a.userId === "u-bob")?.access, "manager");
  });

  it("removes a member, keeping the rest", () => {
    const next = writeAgentPerson({
      agent: explicit,
      members: ROSTER,
      selfId: "u-self",
      userId: "u-bob",
      action: "remove",
    });
    strictEqual(
      next.some((a) => a.userId === "u-bob"),
      false,
    );
    strictEqual(
      next.some((a) => a.userId === "u-self"),
      true,
    );
  });

  it("materializes an everyone-agent into an explicit roster on first edit", () => {
    const everyone = agent({ id: "e", assignedUserIds: [], assignments: [] });
    const next = writeAgentPerson({
      agent: everyone,
      members: ROSTER,
      selfId: "u-self",
      userId: "u-bob",
      action: "remove",
    });
    // Bob is dropped; the rest of the team becomes an explicit roster.
    strictEqual(
      next.some((a) => a.userId === "u-bob"),
      false,
    );
    strictEqual(
      next.some((a) => a.userId === "u-cara"),
      true,
    );
    strictEqual(
      next.some((a) => a.userId === "u-self"),
      true,
    );
  });

  it("never strips the org owner on remove", () => {
    const next = writeAgentPerson({
      agent: explicit,
      members: ROSTER,
      selfId: "u-self",
      userId: "u-self",
      action: "remove",
    });
    strictEqual(
      next.some((a) => a.userId === "u-self"),
      true,
    );
  });
});

describe("agentPersonNeedsConfirm (self-lockout gate)", () => {
  const rowFor = (m: OrgMember, selfId: string) =>
    buildAgentPeople({
      agent: agent({
        id: "x",
        assignedUserIds: [m.userId],
        assignments: [{ userId: m.userId, access: "manager" }],
      }),
      members: [SELF, m],
      selfId,
    }).find((r) => r.member.userId === m.userId);

  it("confirms when the viewer demotes/removes their own row", () => {
    const self = member({ userId: "u-cara", role: "admin" });
    const row = rowFor(self, "u-cara");
    ok(row);
    strictEqual(agentPersonNeedsConfirm(row, "remove"), true);
    strictEqual(agentPersonNeedsConfirm(row, "user"), true);
  });

  it("does not confirm promoting self, or acting on another member", () => {
    const self = member({ userId: "u-cara", role: "admin" });
    const selfRow = rowFor(self, "u-cara");
    const otherRow = rowFor(BOB, "u-cara");
    ok(selfRow);
    ok(otherRow);
    strictEqual(agentPersonNeedsConfirm(selfRow, "manager"), false);
    strictEqual(agentPersonNeedsConfirm(otherRow, "remove"), false);
  });

  it("never confirms for the org owner", () => {
    const row = buildAgentPeople({
      agent: agent({ id: "x", assignedUserIds: ["u-bob"], assignments: [] }),
      members: ROSTER,
      selfId: "u-self",
    }).find((r) => r.isOwner);
    ok(row);
    strictEqual(agentPersonNeedsConfirm(row, "remove"), false);
  });
});

describe("canPersonBeManager", () => {
  it("only org owner/admin may hold a Manager seat", () => {
    strictEqual(canPersonBeManager("owner"), true);
    strictEqual(canPersonBeManager("admin"), true);
    strictEqual(canPersonBeManager("user"), false);
  });
});

describe("agentPeopleView (People tab render decision)", () => {
  it("shows the roster whenever there are rows, editable or not", () => {
    strictEqual(agentPeopleView(3, false), "roster");
    strictEqual(agentPeopleView(3, true), "roster");
    strictEqual(agentPeopleView(1, true), "roster");
  });

  it("degrades an EMPTY read-only roster to the honest viewer line", () => {
    // A plain member's `GET /org` omits the roster (owner/admin only), so a
    // read-only viewer with zero rows sees the viewer line, not a misleading
    // "no people" empty state.
    strictEqual(agentPeopleView(0, true), "viewerOnly");
  });

  it("shows the empty state only in an EDITABLE context with no members", () => {
    strictEqual(agentPeopleView(0, false), "empty");
  });
});
