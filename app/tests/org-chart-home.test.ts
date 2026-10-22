import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston/engine-adapter";
import { agentPeople } from "../src/components/organization/org-chart-people.ts";
import { shareCardLayout } from "../src/components/organization/org-chart-share-layout.ts";
import { shareCardCaps } from "../src/components/organization/org-chart-share-model.ts";
import {
  buildOrgTree,
  SCREEN_TREE_CAPS,
} from "../src/components/organization/org-chart-tree.ts";

const members: OrgMember[] = [
  { userId: "owner-first", role: "owner", displayName: "A Team Owner" },
  { userId: "creator", role: "owner", displayName: "Z Team Owner" },
  { userId: "admin", role: "admin", displayName: "M Team Admin" },
  { userId: "user", role: "user", displayName: "Team Member" },
];
const employee: Agent = {
  id: "employee",
  name: "Employee",
  folderPath: "employee",
  configId: "c",
  createdAt: "2026-01-01",
  access: "manager",
  assignments: [{ userId: "creator", access: "manager" }],
};
const unnamedAccount = "Unnamed account";
const input = (agent: Agent) => ({
  unnamedAccount,
  agents: [agent],
  members,
  name: "Team",
  personal: false,
});
const home = (agent: Agent) =>
  buildOrgTree(input(agent), SCREEN_TREE_CAPS).branches.find(
    (branch) => branch.agents.length > 0,
  )?.person.userId;

describe("org chart creator placement", () => {
  it("homes an owner-created employee under that owner instead of the first owner by name", () => {
    strictEqual(home(employee), "creator");
    deepStrictEqual(
      agentPeople(employee, members, unnamedAccount)?.manages.map(
        (p) => p.userId,
      ),
      ["owner-first", "creator"],
    );
  });

  it("prefers the explicit owner manager to the single user", () => {
    strictEqual(
      home({
        ...employee,
        assignments: [
          { userId: "user", access: "user" },
          { userId: "creator", access: "manager" },
        ],
      }),
      "creator",
    );
  });

  it("prefers an explicit admin manager to implicit owner authority", () => {
    strictEqual(
      home({
        ...employee,
        assignments: [
          { userId: "admin", access: "manager" },
          { userId: "user", access: "user" },
        ],
      }),
      "admin",
    );
  });

  it("breaks explicit manager ties by name across roles, independent of assignment order", () => {
    for (const assignments of [
      [
        { userId: "creator", access: "manager" },
        { userId: "admin", access: "manager" },
      ],
      [
        { userId: "admin", access: "manager" },
        { userId: "creator", access: "manager" },
      ],
    ] satisfies Agent["assignments"][]) {
      strictEqual(home({ ...employee, assignments }), "admin");
    }
  });

  it("does not turn an explicit owner user row into a creator manager row", () => {
    strictEqual(
      home({
        ...employee,
        assignments: [
          { userId: "creator", access: "user" },
          { userId: "user", access: "user" },
        ],
      }),
      "user",
    );
  });

  it("ignores removed managers and retains the single-user fallback", () => {
    strictEqual(
      home({
        ...employee,
        assignments: [
          { userId: "removed", access: "manager" },
          { userId: "user", access: "user" },
        ],
      }),
      "user",
    );
  });

  it("keeps stale manager rows for plain members as use, and hidden assignments hidden", () => {
    strictEqual(
      home({
        ...employee,
        assignments: [
          { userId: "user", access: "manager" },
          { userId: "creator", access: "manager" },
        ],
      }),
      "creator",
    );
    strictEqual(home({ ...employee, access: "user" }), "owner-first");
  });

  it("uses the same placement for the screen and the share image", () => {
    const screen = buildOrgTree(input(employee), SCREEN_TREE_CAPS);
    const share = buildOrgTree(input(employee), shareCardCaps(members.length));
    deepStrictEqual(share, screen);
    const { boxes } = shareCardLayout(share, {
      morePeople: (count) => `+${count} people`,
      moreAgents: (count) => `+${count} employees`,
    });
    const creator = boxes.find((box) => box.id === "p:creator");
    const agent = boxes.find((box) => box.id === "a:employee");
    ok(agent && creator);
    strictEqual(agent.x, creator.x);
    ok(agent.y > creator.y);
  });
});
