import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston/engine-adapter";
import {
  CARD,
  CARD_TEXT,
} from "../src/components/organization/org-chart-share-card-geometry.ts";
import { shareCardLayout } from "../src/components/organization/org-chart-share-layout.ts";
import { SHARE_CARD_CAPS } from "../src/components/organization/org-chart-share-model.ts";
import { buildOrgTree } from "../src/components/organization/org-chart-tree.ts";

const agent = (id: string, userId?: string): Agent => ({
  id,
  name: `Agent ${id}`,
  folderPath: id,
  configId: "c",
  createdAt: "2026-01-01",
  access: "manager",
  assignments: userId ? [{ userId, access: "user" }] : undefined,
});
const roster = (n: number): OrgMember[] => [
  { userId: "owner", role: "owner", displayName: "Owner" },
  ...Array.from({ length: n - 1 }, (_, i) => ({
    userId: `u${i}`,
    role: "user" as const,
    displayName: `User ${String(i).padStart(2, "0")}`,
  })),
];
const layout = (agents: Agent[], members: OrgMember[], personal = false) =>
  shareCardLayout(
    buildOrgTree({ agents, members, name: "Acme", personal }, SHARE_CARD_CAPS),
    {
      role: (person) => person.role,
      people: (n) => `${n} people`,
      agents: (n) => `${n} AI Employees`,
    },
  );

describe("shareCardLayout", () => {
  it("keeps every disc and label inside the card, between header and footer", () => {
    const agents = Array.from({ length: 30 }, (_, i) =>
      agent(`a${i}`, `u${i % 9}`),
    );
    const { discs, lines } = layout(agents, roster(10));
    for (const disc of discs) {
      ok(disc.x - disc.r >= 0 && disc.x + disc.r <= CARD.width, `x ${disc.x}`);
      ok(disc.y - disc.r > CARD_TEXT.countsY, `y ${disc.y}`);
      // Name and role lines sit under the disc and clear the footer.
      const depth = disc.label ? 64 : 0;
      ok(disc.y + disc.r + depth < CARD_TEXT.footerY - 30, `label ${disc.y}`);
    }
    for (const line of lines)
      ok(line.y2 >= line.y1 && line.y2 < CARD_TEXT.footerY);
  });

  it("draws six people and a +N, each with three AI Employees and a +N", () => {
    const agents = Array.from({ length: 30 }, (_, i) =>
      agent(`a${i}`, `u${i % 9}`),
    );
    const { discs } = layout(agents, roster(10));
    const kinds = discs.map((d) => d.node.kind);
    strictEqual(kinds.filter((k) => k === "person").length, 6);
    const more = discs.flatMap((d) =>
      d.node.kind === "more" ? [d.node.count] : [],
    );
    ok(more.includes(4), `people overflow ${more}`);
    // The owner is always on the card, and the people left out say what
    // they bring: 9 users hold 30 agents, 5 are shown, 4 are left out.
    ok(
      discs.some(
        (d) => d.node.kind === "person" && d.node.person.userId === "owner",
      ),
    );
    const peopleMore = discs.find(
      (d) => d.node.kind === "more" && d.label === "4 people",
    );
    ok(peopleMore, "people overflow disc");
    // u5..u8 are left out, three AI Employees each.
    strictEqual(peopleMore?.sublabel, "12 AI Employees");
    const firstColumn = discs.filter((d) => d.x === discs[1].x);
    // person, then at most three agents and the overflow disc
    ok(firstColumn.length <= 5, `${firstColumn.length}`);
  });

  it("centres a lone branch under the root with a straight line", () => {
    const { discs, lines } = layout([agent("a")], roster(1));
    deepStrictEqual(
      discs.map((d) => [d.node.kind, d.x]),
      [
        ["company", CARD.width / 2],
        ["person", CARD.width / 2],
        ["agent", CARD.width / 2],
      ],
    );
    ok(
      lines.every((line) => line.x1 === CARD.width / 2 && line.x2 === line.x1),
    );
  });

  it("lays a personal space out as its person over a row of AI Employees", () => {
    const agents = Array.from({ length: 8 }, (_, i) => agent(`a${i}`));
    const { discs } = layout(agents, roster(1), true);
    strictEqual(discs[0].node.kind, "person");
    strictEqual(discs.filter((d) => d.node.kind === "agent").length, 6);
    const more = discs.find((d) => d.node.kind === "more");
    deepStrictEqual(more?.node, { kind: "more", count: 2 });
  });

  it("labels people with their role and AI Employees with theirs", () => {
    const { discs } = layout(
      [{ ...agent("a"), role: "Inbox keeper" }],
      roster(1),
    );
    const person = discs.find((d) => d.node.kind === "person");
    const ai = discs.find((d) => d.node.kind === "agent");
    strictEqual(person?.sublabel, "owner");
    strictEqual(ai?.label, "Agent a");
    strictEqual(ai?.sublabel, "Inbox keeper");
  });
});
