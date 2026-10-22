import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston/engine-adapter";
import {
  PORTRAIT_FRAME as CARD,
  type CardBox,
  NODE,
  onCard,
  SHARE_MIN_TYPE,
} from "../src/components/organization/org-chart-share-card-geometry.ts";
import { shareCardLayout } from "../src/components/organization/org-chart-share-layout.ts";
import { shareCardCaps } from "../src/components/organization/org-chart-share-model.ts";
import { buildOrgTree } from "../src/components/organization/org-chart-tree.ts";
import type { Box } from "../src/components/organization/org-chart-tree-paths.ts";

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
    buildOrgTree(
      {
        unnamedAccount: "Unnamed account",
        agents,
        members,
        name: "Acme",
        personal,
      },
      shareCardCaps(members.length),
    ),
    {
      morePeople: (n) => `+${n} people`,
      moreAgents: (n) => `+${n} AI Employees`,
    },
  );

/** Every coordinate a path visits. */
const pathPoints = (d: string) =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);

function noOverlaps(boxes: CardBox[]) {
  for (const a of boxes)
    for (const b of boxes) {
      if (a === b) continue;
      const apart =
        a.x + a.w <= b.x ||
        b.x + b.w <= a.x ||
        a.y + a.h <= b.y ||
        b.y + b.h <= a.y;
      ok(apart, `${a.id} overlaps ${b.id}`);
    }
}

/**
 * Whether any run of `path` passes through a card. Each `M` starts a new
 * edge; a rounded corner's control point stands in for its curve.
 */
function crossesCard(path: string, boxes: Box[]): boolean {
  const inside = (box: Box, x: number, y: number) =>
    x > box.x + 0.5 &&
    x < box.x + box.w - 0.5 &&
    y > box.y + 0.5 &&
    y < box.y + box.h - 0.5;
  for (const edge of path.split("M").filter(Boolean)) {
    const points = pathPoints(`M${edge}`);
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      for (let t = 0; t <= 1; t += 0.05)
        if (
          boxes.some((b) => inside(b, ax + (bx - ax) * t, ay + (by - ay) * t))
        )
          return true;
    }
  }
  return false;
}

const many = (n: number, holders: number, offset = 0) =>
  Array.from({ length: n }, (_, i) =>
    agent(`a${i}`, holders ? `u${(i % holders) + offset}` : undefined),
  );
/** Nine people holding 40 AI Employees, the owner first with none. */
const big = () => layout(many(40, 9), roster(10));

/** Whether every card sits inside the frame, between header and footer. */
function insideRoom({ boxes, zoom }: ReturnType<typeof layout>, name: string) {
  for (const box of boxes.map((b) => ({ ...b, ...onCard(zoom, b) }))) {
    ok(box.x >= 0 && box.x + box.w <= CARD.width + 1e-9, `${name} x ${box.id}`);
    ok(box.y >= CARD.room.top - 1e-9, `${name} top ${box.id}`);
    ok(box.y + box.h <= CARD.room.bottom + 1e-9, `${name} bottom ${box.id}`);
  }
}

describe("shareCardLayout", () => {
  it("fits every chart at the minimum type: names 30px, roles 22px", () => {
    const charts = {
      "1 person, 1 AI Employee": layout([agent("a")], roster(1), true),
      "1 person in a team": layout([agent("a", "owner")], roster(1)),
      "6 people": layout(many(12, 5), roster(6)),
      "6 people, none with AI Employees": layout([], roster(6)),
      "9 people, 40 AI Employees": big(),
      "a personal space of 40": layout(many(40, 0), roster(1), true),
    };
    for (const [name, chart] of Object.entries(charts)) {
      const { scale } = chart.zoom;
      ok(scale >= 1 - 1e-9, `${name}: zoom ${scale}`);
      for (const shape of ["column", "leaf"] as const) {
        ok(NODE[shape].name * scale >= SHARE_MIN_TYPE.name - 1e-9, name);
        ok(NODE[shape].role * scale >= SHARE_MIN_TYPE.role - 1e-9, name);
      }
      insideRoom(chart, name);
      noOverlaps(chart.boxes);
    }
    strictEqual(SHARE_MIN_TYPE.name, 30);
    strictEqual(SHARE_MIN_TYPE.role, 22);
    strictEqual(CARD.width, 1200);
    strictEqual(CARD.height, 1500);
  });

  it("only draws lines between cards, never past the outermost ones", () => {
    const { boxes, path } = big();
    ok(path.length > 0);
    const left = Math.min(...boxes.slice(1).map((b) => b.x + b.w / 2));
    const right = Math.max(...boxes.slice(1).map((b) => b.x + b.w / 2));
    for (const [x, y] of pathPoints(path)) {
      ok(x >= left - 0.5 && x <= right + 0.5, `x ${x}`);
      ok(y >= boxes[0].y + boxes[0].h - 0.5, `y ${y}`);
      ok(y < Math.max(...boxes.map((b) => b.y + b.h)) + 0.5, `y ${y}`);
    }
    ok(!crossesCard(path, boxes));
  });

  it("shows a crowd as three people and a +N, four AI Employees each and a +N", () => {
    const { boxes } = big();
    const people = boxes.filter((b) => b.node.kind === "person");
    strictEqual(people.length, 3);
    // The owner is always on the card, and the people left out are counted.
    ok(
      people.some(
        (b) => b.node.kind === "person" && b.node.person.userId === "owner",
      ),
    );
    strictEqual(boxes.find((b) => b.id === "more:people")?.label, "+7 people");
    strictEqual(boxes.filter((b) => b.shape === "column").length, 4);
    const u0 = boxes.find((b) => b.id === "p:u0");
    const column = boxes.filter((b) => b.x === u0?.x);
    // User 0 holds five: four shown, then the "+1".
    deepStrictEqual(
      column.map((b) => b.shape),
      ["column", "leaf", "leaf", "leaf", "leaf", "moreLeaf"],
    );
  });

  it("shows four people whole, with no +N", () => {
    const { boxes } = layout(many(8, 3), roster(4));
    strictEqual(boxes.filter((b) => b.node.kind === "person").length, 4);
    ok(!boxes.some((b) => b.id === "more:people"));
  });

  it("grows a small team to fill the frame, centred under the header", () => {
    const small = layout([agent("a", "owner"), agent("b", "owner")], roster(1));
    ok(small.zoom.scale > 1.5, `small ${small.zoom.scale}`);
    const [root] = small.boxes.map((b) => onCard(small.zoom, b));
    strictEqual(root.x + root.w / 2, CARD.width / 2);
  });

  it("centres a lone branch under the root with a straight line", () => {
    const { boxes, path } = layout([agent("a")], roster(1));
    const centre = 600;
    for (const box of boxes) strictEqual(box.x + box.w / 2, centre);
    ok(
      pathPoints(path).every(([x]) => x === centre),
      path,
    );
  });

  it("lays a personal space out as its person over its AI Employees", () => {
    const { boxes } = layout(many(8, 0), roster(1), true);
    strictEqual(boxes[0].node.kind, "person");
    strictEqual(boxes[0].shape, "root");
    strictEqual(boxes.filter((b) => b.node.kind === "agent").length, 6);
    deepStrictEqual(boxes.find((b) => b.node.kind === "more")?.node, {
      kind: "more",
      count: 2,
    });
    ok(boxes.slice(1).every((b) => b.shape === "column"));
  });

  it("names every card, and gives an AI Employee its role underneath", () => {
    const { boxes } = layout(
      [{ ...agent("a", "owner"), role: "Inbox keeper" }],
      roster(1),
    );
    const person = boxes.find((b) => b.node.kind === "person");
    const ai = boxes.find((b) => b.node.kind === "agent");
    strictEqual(person?.label, "Owner");
    strictEqual(person?.sublabel, undefined);
    strictEqual(ai?.label, "Agent a");
    strictEqual(ai?.sublabel, "Inbox keeper");
    strictEqual(boxes[0].label, "Acme");
  });

  it("wraps five to seven AI Employees onto two lines, the second in the first's gaps", () => {
    const rows = (agents: number) => {
      const chart = layout(many(agents, 0), roster(1), true);
      const cards = chart.boxes.slice(1);
      const tops = [...new Set(cards.map((b) => b.y))].sort((a, b) => a - b);
      return {
        ...chart,
        first: cards.filter((b) => b.y === tops[0]),
        second: cards.filter((b) => b.y === tops[1]),
      };
    };
    strictEqual(rows(4).second.length, 0);
    // 8 AI Employees show as six and a "+2": seven columns.
    for (const [agents, across, below] of [
      [5, 3, 2],
      [6, 4, 2],
      [8, 4, 3],
    ]) {
      const { boxes, path, first, second } = rows(agents);
      strictEqual(first.length, across, `${agents} first`);
      strictEqual(second.length, below, `${agents} second`);
      noOverlaps(boxes);
      ok(!crossesCard(path, boxes), `${agents} line through a card`);
      const mid = (b: Box) => b.x + b.w / 2;
      // Symmetric about the root, and every second-line card's line drops
      // through a gap: clear of every card above it.
      const offsets = second.map((b) => mid(b) - 600);
      for (const offset of offsets)
        ok(
          offsets.some((o) => Math.abs(o + offset) < 1e-9),
          `${agents} sym`,
        );
      for (const b of second)
        for (const above of first)
          ok(
            mid(b) > above.x + above.w + 20 || mid(b) < above.x - 20,
            `${agents} ${b.id} under ${above.id}`,
          );
    }
  });
});
