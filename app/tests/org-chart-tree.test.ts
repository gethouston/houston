import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston/engine-adapter";
import {
  agentHome,
  buildOrgTree,
  type OrgTree,
  type OrgTreeCaps,
  SCREEN_TREE_CAPS,
} from "../src/components/organization/org-chart-tree.ts";

const members: OrgMember[] = [
  { userId: "tom", role: "user", displayName: "Tom Reed" },
  { userId: "sara", role: "admin", displayName: "Sara Diaz" },
  { userId: "julian", role: "owner", displayName: "Julian Arango" },
  { userId: "abe", role: "admin", displayName: "Abe Lowe" },
  { userId: "ana", role: "user", displayName: "Ana Ruiz" },
];

const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({
  id,
  name: id,
  folderPath: id,
  configId: "c",
  createdAt: "2026-01-01",
  access: "manager",
  ...extra,
});

const build = (
  agents: Agent[],
  opts: { personal?: boolean; caps?: OrgTreeCaps; roster?: OrgMember[] } = {},
) =>
  buildOrgTree(
    {
      agents,
      members: opts.roster ?? members,
      name: "Acme",
      personal: opts.personal ?? false,
    },
    opts.caps ?? SCREEN_TREE_CAPS,
  );

/** Each person shown with the ids of the AI Employees homed under them. */
const homes = (tree: OrgTree) =>
  Object.fromEntries(
    tree.branches.map((b) => [b.person.userId, b.agents.map((a) => a.id)]),
  );

describe("buildOrgTree", () => {
  it("rows people owners first, then admins, then users, each by name", () => {
    const tree = build([]);
    deepStrictEqual(
      tree.branches.map((b) => b.person.userId),
      ["julian", "abe", "sara", "ana", "tom"],
    );
    deepStrictEqual(tree.root, { kind: "company", name: "Acme" });
    deepStrictEqual(tree.counts, { people: 5, agents: 0 });
  });

  it("homes an agent under its admin manager, never under the owner who manages everything", () => {
    const tree = build([
      agent("scout", {
        assignments: [
          { userId: "sara", access: "manager" },
          { userId: "abe", access: "manager" },
          { userId: "tom", access: "user" },
        ],
      }),
    ]);
    // Abe sorts before Sara by name; Julian (owner) manages it too.
    deepStrictEqual(homes(tree).abe, ["scout"]);
    deepStrictEqual(homes(tree).julian, []);
  });

  it("homes an agent with exactly one user under that user", () => {
    const tree = build([
      agent("inbox", { assignments: [{ userId: "ana", access: "user" }] }),
    ]);
    deepStrictEqual(homes(tree).ana, ["inbox"]);
  });

  it("homes an agent shared with everyone, or with several users, under the first owner", () => {
    const tree = build([
      agent("everyone"),
      agent("pair", {
        assignments: [
          { userId: "ana", access: "user" },
          { userId: "tom", access: "user" },
        ],
      }),
    ]);
    deepStrictEqual(homes(tree).julian, ["everyone", "pair"]);
  });

  it("does not count an ex-admin's stale manager row as an admin manager", () => {
    const tree = build([
      agent("stale", { assignments: [{ userId: "tom", access: "manager" }] }),
    ]);
    // Tom is a user now: his row counts as use, and he is the one user.
    deepStrictEqual(homes(tree).tom, ["stale"]);
  });

  it("homes an agent whose people the caller cannot see under the first owner", () => {
    const tree = build([agent("hidden", { access: "user" })]);
    deepStrictEqual(homes(tree).julian, ["hidden"]);
  });

  it("lists each person's AI Employees by name", () => {
    const tree = build([agent("zed"), agent("alpha"), agent("mid")]);
    deepStrictEqual(homes(tree).julian, ["alpha", "mid", "zed"]);
  });

  it("hangs agents off the root when nobody on the roster can hold them", () => {
    const tree = build([agent("orphan")], { roster: [] });
    deepStrictEqual(tree.branches, []);
    deepStrictEqual(
      tree.rootAgents.map((a) => a.id),
      ["orphan"],
    );
  });

  it("caps each person's AI Employees and counts the rest", () => {
    const caps = { people: 10, agentsPerPerson: 2, rootAgents: 2 };
    const tree = build([agent("a"), agent("b"), agent("c"), agent("d")], {
      caps,
    });
    const owner = tree.branches.find((b) => b.person.userId === "julian");
    deepStrictEqual(
      owner?.agents.map((a) => a.id),
      ["a", "b"],
    );
    strictEqual(owner?.moreAgents, 2);
  });

  it("caps the people row, dropping people with no AI Employees first, in roster order", () => {
    const caps = { people: 2, agentsPerPerson: 5, rootAgents: 5 };
    const tree = build(
      [agent("inbox", { assignments: [{ userId: "tom", access: "user" }] })],
      { caps },
    );
    deepStrictEqual(
      tree.branches.map((b) => b.person.userId),
      ["julian", "tom"],
    );
    strictEqual(tree.morePeople, 3);
    deepStrictEqual(tree.counts, { people: 5, agents: 1 });
  });

  it("never drops an owner from a capped row, even one with no AI Employees", () => {
    const caps = { people: 2, agentsPerPerson: 5, rootAgents: 5 };
    const tree = build(
      [
        agent("scout", {
          assignments: [{ userId: "sara", access: "manager" }],
        }),
        agent("books", { assignments: [{ userId: "abe", access: "manager" }] }),
        agent("inbox", { assignments: [{ userId: "tom", access: "user" }] }),
      ],
      { caps },
    );
    deepStrictEqual(
      tree.branches.map((b) => b.person.userId),
      ["julian", "abe"],
    );
    // Sara and Tom are left out with the two AI Employees they are home to.
    strictEqual(tree.morePeople, 3);
    strictEqual(tree.morePeopleAgents, 2);
  });

  it("accounts for every person and AI Employee, whatever the caps", () => {
    const roster: OrgMember[] = Array.from({ length: 9 }, (_, i) => ({
      userId: `p${i}`,
      role: i === 0 ? "owner" : i < 3 ? "admin" : "user",
      displayName: `Person ${i}`,
    }));
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let run = 0; run < 200; run++) {
      const agents = Array.from({ length: next(25) }, (_, i) =>
        agent(`a${run}-${i}`, {
          assignments: [
            {
              userId: `p${next(9)}`,
              access: next(2) === 0 ? "manager" : "user",
            },
          ],
        }),
      );
      const caps = {
        people: 1 + next(8),
        agentsPerPerson: next(5),
        rootAgents: next(5),
      };
      const members = roster.slice(0, next(10));
      const personal = next(5) === 0;
      const tree = build(agents, { caps, roster: members, personal });
      const shownAgents =
        tree.branches.reduce((n, b) => n + b.agents.length + b.moreAgents, 0) +
        tree.rootAgents.length +
        tree.moreRootAgents +
        tree.morePeopleAgents;
      strictEqual(shownAgents, tree.counts.agents, `run ${run} agents`);
      const shownPeople =
        tree.branches.length +
        tree.morePeople +
        (tree.root.kind === "person" ? 1 : 0);
      strictEqual(shownPeople, tree.counts.people, `run ${run} people`);
      if (!personal && members.length > 0)
        strictEqual(tree.branches[0].person.role, "owner", `run ${run} owner`);
    }
  });

  it("draws a personal space as its person over every AI Employee", () => {
    const tree = build(
      [
        agent("b", { assignments: [{ userId: "ana", access: "user" }] }),
        agent("a"),
      ],
      {
        personal: true,
        roster: [{ userId: "me", role: "owner", displayName: "Me Myself" }],
        caps: { people: 6, agentsPerPerson: 3, rootAgents: 1 },
      },
    );
    strictEqual(tree.root.kind, "person");
    deepStrictEqual(tree.branches, []);
    deepStrictEqual(
      tree.rootAgents.map((a) => a.id),
      ["a"],
    );
    strictEqual(tree.moreRootAgents, 1);
    deepStrictEqual(tree.counts, { people: 1, agents: 2 });
  });

  it("names a personal space with no roster after the space", () => {
    const tree = build([agent("a")], { personal: true, roster: [] });
    deepStrictEqual(tree.root, { kind: "company", name: "Acme" });
    deepStrictEqual(tree.counts, { people: 0, agents: 1 });
  });

  it("keeps the role and colour an AI Employee is drawn with", () => {
    const tree = build([agent("a", { role: "  Inbox  ", color: "navy" })]);
    deepStrictEqual(tree.branches[0].agents[0], {
      id: "a",
      name: "a",
      role: "Inbox",
      color: "navy",
    });
  });
});

describe("agentHome", () => {
  it("falls back to the first person when the roster has no owner", () => {
    strictEqual(
      agentHome(null, [{ userId: "x", name: "X", role: "user" }]),
      "x",
    );
    strictEqual(agentHome(null, []), null);
  });
});
