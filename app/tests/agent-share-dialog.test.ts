import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgMember } from "@houston-ai/engine-client";
import {
  addableMembers,
  addPerson,
  agentShareMode,
  applyShareAction,
  buildSharePeople,
  currentAssignments,
  isSharedWithOthers,
  needsSelfLockoutConfirm,
  type SharePerson,
} from "../src/components/tabs/agent-access-model.ts";

const OWNER: OrgMember = { userId: "own", email: "owner@x.co", role: "owner" };
const ADMIN: OrgMember = { userId: "adm", email: "admin@x.co", role: "admin" };
const MEMBER: OrgMember = { userId: "mem", email: "member@x.co", role: "user" };
const OTHER: OrgMember = { userId: "oth", email: "other@x.co", role: "user" };
const ROSTER = [OWNER, ADMIN, MEMBER, OTHER];

describe("agentShareMode", () => {
  const caps = (over: Partial<Capabilities>): Capabilities =>
    ({ ...over }) as Capabilities;

  it("is 'team' for a manager in a team space", () => {
    // Owner manages any org agent; a team space is not a personal space.
    strictEqual(
      agentShareMode(caps({ multiplayer: true, role: "owner" }), {}, false),
      "team",
    );
    strictEqual(
      agentShareMode(
        caps({ multiplayer: true, role: "admin" }),
        { access: "manager" },
        false,
      ),
      "team",
    );
  });

  it("is 'none' for a plain member of a team space (can't share)", () => {
    strictEqual(
      agentShareMode(
        caps({ multiplayer: true, role: "user" }),
        { access: "user" },
        false,
      ),
      "none",
    );
  });

  it("is 'inviteTeam' in a personal space on a spaces-capable host", () => {
    strictEqual(agentShareMode(caps({ spaces: true }), {}, true), "inviteTeam");
  });

  it("prefers 'inviteTeam' over 'team' in a personal space (never the team dialog)", () => {
    // Even if the host still reports multiplayer/owner, a personal space is
    // non-invitable: the team dialog's addOrgMember would 403 personal_space.
    strictEqual(
      agentShareMode(
        caps({ spaces: true, multiplayer: true, role: "owner" }),
        {},
        true,
      ),
      "inviteTeam",
    );
  });

  it("is 'none' on desktop/self-host (no spaces, no multiplayer)", () => {
    strictEqual(agentShareMode(caps({}), {}, true), "none");
    strictEqual(agentShareMode(null, {}, true), "none");
  });

  it("is 'none' in a personal space when the host lacks the spaces surface", () => {
    // A non-spaces host never offers invite-your-team, even in a personal space.
    strictEqual(agentShareMode(caps({ multiplayer: false }), {}, true), "none");
  });
});

describe("currentAssignments", () => {
  it("prefers the rich v2 assignments", () => {
    deepStrictEqual(
      currentAssignments({
        assignments: [{ userId: "adm", access: "manager" }],
        assignedUserIds: ["ignored"],
      }),
      [{ userId: "adm", access: "manager" }],
    );
  });

  it("falls back to assignedUserIds mapped to 'user' access", () => {
    deepStrictEqual(currentAssignments({ assignedUserIds: ["adm", "mem"] }), [
      { userId: "adm", access: "user" },
      { userId: "mem", access: "user" },
    ]);
  });

  it("is empty when nothing is populated", () => {
    deepStrictEqual(currentAssignments({}), []);
  });
});

describe("buildSharePeople", () => {
  it("always includes the org owner as a non-editable manager, even when unassigned", () => {
    const people = buildSharePeople({
      agent: { assignments: [{ userId: "mem", access: "user" }] },
      members: ROSTER,
      selfId: null,
    });
    const owner = people.find((p) => p.userId === "own");
    strictEqual(owner?.isOwner, true);
    strictEqual(owner?.access, "manager");
    strictEqual(owner?.canBeManager, true);
    // Owner sorts first.
    strictEqual(people[0].userId, "own");
  });

  it("marks admins manager-eligible and plain members not", () => {
    const people = buildSharePeople({
      agent: {
        assignments: [
          { userId: "adm", access: "user" },
          { userId: "mem", access: "user" },
        ],
      },
      members: ROSTER,
      selfId: "mem",
    });
    strictEqual(people.find((p) => p.userId === "adm")?.canBeManager, true);
    const member = people.find((p) => p.userId === "mem");
    strictEqual(member?.canBeManager, false);
    strictEqual(member?.isSelf, true);
  });

  it("sorts owner, then managers, then members", () => {
    const people = buildSharePeople({
      agent: {
        assignments: [
          { userId: "mem", access: "user" },
          { userId: "adm", access: "manager" },
        ],
      },
      members: ROSTER,
      selfId: null,
    });
    deepStrictEqual(
      people.map((p) => p.userId),
      ["own", "adm", "mem"],
    );
  });
});

describe("buildSharePeople org-wide", () => {
  it("expands an org-wide agent (present-but-empty assignee set) to every member", () => {
    for (const agent of [{ assignedUserIds: [] }, { assignments: [] }]) {
      const people = buildSharePeople({ agent, members: ROSTER, selfId: null });
      deepStrictEqual(people.map((p) => p.userId).sort(), [
        "adm",
        "mem",
        "oth",
        "own",
      ]);
    }
  });

  it("does NOT treat a single-player agent (no assignee fields) as org-wide", () => {
    const people = buildSharePeople({
      agent: {},
      members: ROSTER,
      selfId: null,
    });
    // Only the always-present org owner.
    deepStrictEqual(
      people.map((p) => p.userId),
      ["own"],
    );
  });

  it("removing one person from an org-wide agent keeps everyone else", () => {
    const people = buildSharePeople({
      agent: { assignedUserIds: [] },
      members: ROSTER,
      selfId: null,
    });
    deepStrictEqual(
      applyShareAction(people, "mem", "remove")
        .map((a) => a.userId)
        .sort(),
      ["adm", "oth", "own"],
    );
  });

  it("leaves nobody addable when the agent is already org-wide", () => {
    const people = buildSharePeople({
      agent: { assignedUserIds: [] },
      members: ROSTER,
      selfId: null,
    });
    deepStrictEqual(addableMembers(ROSTER, people), []);
  });
});

describe("addableMembers", () => {
  it("excludes people who already have access", () => {
    const people = buildSharePeople({
      agent: { assignments: [{ userId: "mem", access: "user" }] },
      members: ROSTER,
      selfId: null,
    });
    // own (owner, always) + mem have access → adm + oth are addable.
    deepStrictEqual(
      addableMembers(ROSTER, people).map((m) => m.userId),
      ["adm", "oth"],
    );
  });
});

function people(): SharePerson[] {
  return buildSharePeople({
    agent: {
      assignments: [
        { userId: "adm", access: "manager" },
        { userId: "mem", access: "user" },
      ],
    },
    members: ROSTER,
    selfId: "adm",
  });
}

describe("applyShareAction", () => {
  it("promotes a member to manager", () => {
    deepStrictEqual(applyShareAction(people(), "mem", "manager"), [
      { userId: "own", access: "manager" },
      { userId: "adm", access: "manager" },
      { userId: "mem", access: "manager" },
    ]);
  });

  it("demotes a manager to can-use", () => {
    const next = applyShareAction(people(), "adm", "user");
    deepStrictEqual(
      next.find((a) => a.userId === "adm"),
      {
        userId: "adm",
        access: "user",
      },
    );
  });

  it("removes a person from the roster", () => {
    deepStrictEqual(
      applyShareAction(people(), "mem", "remove").map((a) => a.userId),
      ["own", "adm"],
    );
  });

  it("never removes the org owner", () => {
    deepStrictEqual(
      applyShareAction(people(), "own", "remove").map((a) => a.userId),
      ["own", "adm", "mem"],
    );
  });
});

describe("addPerson", () => {
  it("adds a new person with can-use access", () => {
    deepStrictEqual(addPerson(people(), OTHER), [
      { userId: "own", access: "manager" },
      { userId: "adm", access: "manager" },
      { userId: "mem", access: "user" },
      { userId: "oth", access: "user" },
    ]);
  });

  it("is a no-op when the person already has access", () => {
    deepStrictEqual(
      addPerson(people(), MEMBER).map((a) => a.userId),
      ["own", "adm", "mem"],
    );
  });
});

describe("needsSelfLockoutConfirm", () => {
  const self = (over: Partial<SharePerson>): SharePerson => ({
    userId: "adm",
    email: "admin@x.co",
    orgRole: "admin",
    access: "manager",
    isSelf: true,
    isOwner: false,
    canBeManager: true,
    ...over,
  });

  it("confirms removing yourself", () => {
    strictEqual(needsSelfLockoutConfirm(self({}), "remove"), true);
  });

  it("confirms demoting yourself to can-use", () => {
    strictEqual(needsSelfLockoutConfirm(self({}), "user"), true);
  });

  it("does not confirm promoting yourself", () => {
    strictEqual(needsSelfLockoutConfirm(self({}), "manager"), false);
  });

  it("never confirms for the org owner (they keep authority)", () => {
    strictEqual(
      needsSelfLockoutConfirm(self({ isOwner: true }), "remove"),
      false,
    );
  });

  it("never confirms for someone else's row", () => {
    strictEqual(
      needsSelfLockoutConfirm(self({ isSelf: false }), "remove"),
      false,
    );
  });
});

describe("isSharedWithOthers", () => {
  it("is true when more than one person has access", () => {
    strictEqual(
      isSharedWithOthers({
        assignments: [
          { userId: "a", access: "manager" },
          { userId: "b", access: "user" },
        ],
      }),
      true,
    );
  });

  it("is false for a solo agent", () => {
    strictEqual(
      isSharedWithOthers({ assignments: [{ userId: "a", access: "manager" }] }),
      false,
    );
    strictEqual(isSharedWithOthers({}), false);
  });

  it("is true for an org-wide agent (present-but-empty assignee set)", () => {
    strictEqual(isSharedWithOthers({ assignedUserIds: [] }), true);
    strictEqual(isSharedWithOthers({ assignments: [] }), true);
  });

  it("is true for a plain member (access=user), who has no assignee list", () => {
    // The gateway withholds assignments/assignedUserIds from non-managers, so a
    // member sees neither field. But an agent they can see at all was shared TO
    // them — the owner (at least) also has access. The note must still render.
    strictEqual(isSharedWithOthers({ access: "user" }), true);
  });

  it("is false for a manager's own unshared agent (access=manager)", () => {
    strictEqual(
      isSharedWithOthers({
        access: "manager",
        assignments: [{ userId: "a", access: "manager" }],
      }),
      false,
    );
  });
});
