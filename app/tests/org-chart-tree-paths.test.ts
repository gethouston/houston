import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgMember } from "@houston/engine-adapter";
import { buildOrgTree } from "../src/components/organization/org-chart-tree.ts";
import {
  type Box,
  connectorPath,
  roundedPath,
  treeEdges,
} from "../src/components/organization/org-chart-tree-paths.ts";

const box = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h });
const opts = { radius: 8, spineInset: 20 };

describe("roundedPath", () => {
  it("rounds each corner, and never by more than half a segment", () => {
    strictEqual(
      roundedPath(
        [
          [0, 0],
          [0, 20],
          [50, 20],
        ],
        8,
      ),
      "M0 0 L0 12 Q0 20 8 20 L50 20",
    );
    // A 6px leg can only take a 3px corner.
    strictEqual(
      roundedPath(
        [
          [0, 0],
          [0, 6],
          [50, 6],
        ],
        8,
      ),
      "M0 0 L0 3 Q0 6 3 6 L50 6",
    );
    strictEqual(roundedPath([[1, 1]], 8), "");
  });
});

describe("connectorPath", () => {
  it("runs a bus from the parent's bottom centre to each child's top centre, ending at the last child", () => {
    const boxes = new Map([
      ["root", box(100, 0)],
      ["a", box(0, 100)],
      ["b", box(200, 100)],
    ]);
    const d = connectorPath(
      [
        { parent: "root", child: "a", kind: "bus" },
        { parent: "root", child: "b", kind: "bus" },
      ],
      boxes,
      opts,
    );
    // Halfway between the root's bottom (40) and the children's top (100).
    strictEqual(
      d,
      "M150 40 L150 62 Q150 70 142 70 L58 70 Q50 70 50 78 L50 100 M150 40 L150 62 Q150 70 158 70 L242 70 Q250 70 250 78 L250 100",
    );
  });

  it("drops straight down when the child sits under the parent, and skips unmeasured nodes", () => {
    const boxes = new Map([
      ["p", box(0, 0)],
      ["c", box(0, 60)],
    ]);
    strictEqual(
      connectorPath(
        [
          { parent: "p", child: "c", kind: "bus" },
          { parent: "p", child: "missing", kind: "chain" },
        ],
        boxes,
        opts,
      ),
      "M50 40 L50 60",
    );
  });

  it("hangs a spine off the parent's left inset into the child's middle", () => {
    const boxes = new Map([
      ["p", box(0, 0)],
      ["c", box(40, 60)],
    ]);
    strictEqual(
      connectorPath([{ parent: "p", child: "c", kind: "spine" }], boxes, opts),
      "M20 40 L20 72 Q20 80 28 80 L40 80",
    );
  });
});

describe("treeEdges", () => {
  const members: OrgMember[] = [
    { userId: "o", role: "owner", displayName: "Olga" },
    { userId: "u", role: "user", displayName: "Uma" },
  ];
  const agent = (id: string) => ({
    id,
    name: id,
    folderPath: id,
    configId: "c",
    createdAt: "2026-01-01",
    access: "manager" as const,
  });
  const tree = buildOrgTree(
    {
      agents: [agent("a"), agent("b"), agent("c")],
      members,
      name: "Acme",
      personal: false,
    },
    { people: 5, agentsPerPerson: 2, rootAgents: 5 },
  );

  it("chains a person's AI Employees on desktop and hangs them off the person on the phone", () => {
    deepStrictEqual(treeEdges(tree, "desktop"), [
      { parent: "root", child: "p:o", kind: "bus" },
      { parent: "p:o", child: "a:a", kind: "chain" },
      { parent: "a:a", child: "a:b", kind: "chain" },
      { parent: "a:b", child: "more:o", kind: "chain" },
      { parent: "root", child: "p:u", kind: "bus" },
    ]);
    deepStrictEqual(
      treeEdges(tree, "phone").map((e) => `${e.parent}>${e.child}:${e.kind}`),
      [
        "root>p:o:spine",
        "p:o>a:a:spine",
        "p:o>a:b:spine",
        "p:o>more:o:spine",
        "root>p:u:spine",
      ],
    );
  });
});
