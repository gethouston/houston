import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston-ai/engine-client";
import {
  agentAccessMode,
  agentPeopleCount,
  canChooseAgentAccess,
  everyoneAssignments,
  everyoneChangesAssignments,
  everyoneSwitchConfirm,
  materializeRoster,
} from "../src/components/agent-settings/agent-people-choice.ts";

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

/** The everyone sentinel: assignee fields present, but empty. */
const EVERYONE = agent({ id: "e", assignments: [], assignedUserIds: [] });

const PICKED = agent({
  id: "p",
  assignments: [
    { userId: "u-self", access: "manager" },
    { userId: "u-bob", access: "user" },
  ],
  assignedUserIds: ["u-self", "u-bob"],
});

const input = (a: Agent) => ({ agent: a, members: ROSTER, selfId: "u-self" });

describe("agentAccessMode", () => {
  it("reads the empty assignee set as everyone in the team", () => {
    strictEqual(agentAccessMode(EVERYONE), "any");
  });

  it("reads an explicit roster as only specific people", () => {
    strictEqual(agentAccessMode(PICKED), "picked");
  });

  it("a single-player agent (no assignee fields) is not an everyone agent", () => {
    strictEqual(agentAccessMode(agent({ id: "s" })), "picked");
  });
});

describe("canChooseAgentAccess", () => {
  it("needs a readable roster: with none, materializing would write the sentinel", () => {
    strictEqual(canChooseAgentAccess([]), false);
    strictEqual(canChooseAgentAccess(ROSTER), true);
  });
});

describe("everyoneAssignments", () => {
  it("is the empty sentinel, and a fresh array each call", () => {
    const first = everyoneAssignments();
    const second = everyoneAssignments();
    deepStrictEqual(first, []);
    // Never a shared mutable constant: one caller's write must not leak.
    ok(first !== second);
  });
});

describe("materializeRoster — switching to only specific people", () => {
  it("expands an everyone agent to the whole team without changing access", () => {
    const written = materializeRoster(input(EVERYONE));
    deepStrictEqual(
      [...written].sort((a, b) => a.userId.localeCompare(b.userId)),
      [
        { userId: "u-bob", access: "user" },
        { userId: "u-cara", access: "user" },
        { userId: "u-self", access: "manager" },
      ],
    );
  });

  it("never loses the owner row", () => {
    for (const a of [EVERYONE, PICKED, agent({ id: "n", assignments: [] })]) {
      const owner = materializeRoster(input(a)).find(
        (row) => row.userId === "u-self",
      );
      deepStrictEqual(owner, { userId: "u-self", access: "manager" });
    }
  });

  it("keeps an explicit roster exactly as it stands (no widening)", () => {
    const written = materializeRoster(input(PICKED));
    deepStrictEqual(
      [...written].sort((a, b) => a.userId.localeCompare(b.userId)),
      [
        { userId: "u-bob", access: "user" },
        { userId: "u-self", access: "manager" },
      ],
    );
  });

  it("materializing then reading back flips the mode to picked", () => {
    const written = materializeRoster(input(EVERYONE));
    strictEqual(
      agentAccessMode({
        assignments: written,
        assignedUserIds: written.map((a) => a.userId),
      }),
      "picked",
    );
  });
});

describe("everyoneChangesAssignments — the confirm gate", () => {
  it("true when someone would gain access", () => {
    // Cara is not on the roster today; the sentinel would let her in.
    strictEqual(everyoneChangesAssignments(input(PICKED)), true);
  });

  it("true when a Manager seat would be dropped (the sentinel cannot carry it)", () => {
    const withManager = agent({
      id: "m",
      assignments: [
        { userId: "u-self", access: "manager" },
        { userId: "u-bob", access: "user" },
        { userId: "u-cara", access: "manager" },
      ],
      assignedUserIds: ["u-self", "u-bob", "u-cara"],
    });
    strictEqual(everyoneChangesAssignments(input(withManager)), true);
  });

  it("false when the explicit roster already resolves to the whole team", () => {
    const wholeTeam = agent({
      id: "w",
      assignments: [
        { userId: "u-self", access: "manager" },
        { userId: "u-bob", access: "user" },
        { userId: "u-cara", access: "user" },
      ],
      assignedUserIds: ["u-self", "u-bob", "u-cara"],
    });
    strictEqual(everyoneChangesAssignments(input(wholeTeam)), false);
  });

  it("false for an agent already on the everyone sentinel", () => {
    strictEqual(everyoneChangesAssignments(input(EVERYONE)), false);
  });

  it("materializing an everyone agent is a round trip: no confirm to go back", () => {
    const written = materializeRoster(input(EVERYONE));
    strictEqual(
      everyoneChangesAssignments(
        input(
          agent({
            id: "r",
            assignments: written,
            assignedUserIds: written.map((a) => a.userId),
          }),
        ),
      ),
      false,
    );
  });
});

describe("everyoneSwitchConfirm — which confirm the switch must show", () => {
  /** Cara is an org admin, so she can hold a Manager seat without being owner. */
  const CARA_MANAGES = agent({
    id: "cm",
    assignments: [
      { userId: "u-self", access: "manager" },
      { userId: "u-cara", access: "manager" },
    ],
    assignedUserIds: ["u-self", "u-cara"],
  });

  it("warns about SELF-LOCKOUT when the viewer is a non-owner manager", () => {
    // The empty sentinel cannot carry a Manager grant, so Cara demotes HERSELF
    // and loses this very page. That is not a generic "everyone gets access".
    strictEqual(
      everyoneSwitchConfirm({
        agent: CARA_MANAGES,
        members: ROSTER,
        selfId: "u-cara",
      }),
      "selfLockout",
    );
  });

  it("the org owner is never locked out (buildSharePeople re-adds them)", () => {
    strictEqual(
      everyoneSwitchConfirm({
        agent: CARA_MANAGES,
        members: ROSTER,
        selfId: "u-self",
      }),
      "changesAccess",
    );
  });

  it("a viewer who only USES the agent is not locking themselves out", () => {
    strictEqual(
      everyoneSwitchConfirm({
        agent: PICKED,
        members: ROSTER,
        selfId: "u-bob",
      }),
      "changesAccess",
    );
  });

  it("no signed-in viewer resolves to no self-lockout", () => {
    strictEqual(
      everyoneSwitchConfirm({
        agent: CARA_MANAGES,
        members: ROSTER,
        selfId: null,
      }),
      "changesAccess",
    );
  });

  it("nothing to confirm when the switch changes nobody's access", () => {
    const wholeTeam = agent({
      id: "w",
      assignments: [
        { userId: "u-self", access: "manager" },
        { userId: "u-bob", access: "user" },
        { userId: "u-cara", access: "user" },
      ],
      assignedUserIds: ["u-self", "u-bob", "u-cara"],
    });
    strictEqual(
      everyoneSwitchConfirm({
        agent: wholeTeam,
        members: ROSTER,
        selfId: "u-self",
      }),
      "none",
    );
    strictEqual(everyoneSwitchConfirm(input(EVERYONE)), "none");
  });
});

describe("agentPeopleCount — the rail badge", () => {
  it("counts the whole team for an everyone agent (the sentinel is not zero)", () => {
    strictEqual(agentPeopleCount(input(EVERYONE)), 3);
  });

  it("counts the expansion, so an explicit roster never undercounts the owner", () => {
    const withoutOwner = agent({
      id: "no",
      assignments: [{ userId: "u-bob", access: "user" }],
      assignedUserIds: ["u-bob"],
    });
    strictEqual(agentPeopleCount(input(withoutOwner)), 2);
    strictEqual(agentPeopleCount(input(PICKED)), 2);
  });

  it("is zero for a single-player agent with no roster to expand", () => {
    strictEqual(
      agentPeopleCount({
        agent: agent({ id: "s" }),
        members: [],
        selfId: null,
      }),
      0,
    );
  });
});
