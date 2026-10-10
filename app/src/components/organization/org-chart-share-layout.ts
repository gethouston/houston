import type { ChartPerson } from "./org-chart-people.ts";
import {
  CARD,
  type CardBox,
  type CardLayout,
  type CardNode,
  NODE,
} from "./org-chart-share-card-geometry.ts";
import type { OrgTree } from "./org-chart-tree.ts";
import {
  type Box,
  connectorPath,
  NODE_ID,
  treeEdges,
} from "./org-chart-tree-paths.ts";

/**
 * Where everything sits on the share image. Pure and DOM-free: the painter
 * only draws what this places, and the connectors come from the same path
 * module the on-screen chart uses.
 *
 * The card is square (1200 x 1200): a chart three levels deep, with each
 * person's AI Employees stacked under them, needs height more than width,
 * and a square image takes the most room LinkedIn's feed gives a post. The
 * root card sits centred under the header, the first row spreads across
 * as equal columns, and each person's AI Employees stack under them, then
 * one "+N" for the rest.
 */

const TREE = {
  rootY: 284,
  rowY: 410,
  /** Space between stacked cards, which the connector spans. */
  gap: 24,
  maxColumn: 236,
  columnGap: 14,
  margin: 56,
  radius: 12,
  /** The lowest a card may reach, clear of the footer. */
  floor: 1080,
} as const;

/** The words the layout writes on cards, all authored `t()` copy. */
export interface CardWords {
  role: (person: ChartPerson) => string;
  /** "4 people". */
  people: (count: number) => string;
  /** "9 AI Employees". */
  agents: (count: number) => string;
}

interface Column {
  head: Omit<CardBox, "x" | "y" | "w" | "h" | "shape">;
  stack: Omit<CardBox, "x" | "y" | "w" | "h" | "shape">[];
}

function columnsOf(tree: OrgTree, words: CardWords): Column[] {
  type Entry = Column["head"];
  const agentEntry = (agent: {
    id: string;
    name: string;
    role?: string;
  }): Entry => ({
    id: NODE_ID.agent(agent.id),
    node: { kind: "agent", agent } as CardNode,
    label: agent.name,
    sublabel: agent.role,
  });
  const more = (id: string, count: number): Entry => ({
    id,
    node: { kind: "more", count } as CardNode,
  });
  const columns: Column[] = tree.branches.map((branch) => {
    const stack = branch.agents.map(agentEntry);
    if (branch.moreAgents > 0)
      stack.push(
        more(NODE_ID.moreAgents(branch.person.userId), branch.moreAgents),
      );
    return {
      head: {
        id: NODE_ID.person(branch.person.userId),
        node: { kind: "person", person: branch.person },
        label: branch.person.name,
        sublabel: words.role(branch.person),
      },
      stack,
    };
  });
  // The people the cap left out, with the AI Employees they bring, so the
  // card's totals still add up.
  if (tree.morePeople > 0)
    columns.push({
      head: {
        ...more(NODE_ID.morePeople, tree.morePeople),
        label: words.people(tree.morePeople),
        sublabel:
          tree.morePeopleAgents > 0
            ? words.agents(tree.morePeopleAgents)
            : undefined,
      },
      stack: [],
    });
  for (const agent of tree.rootAgents)
    columns.push({ head: agentEntry(agent), stack: [] });
  if (tree.moreRootAgents > 0)
    columns.push({
      head: {
        ...more(NODE_ID.moreRoot, tree.moreRootAgents),
        label: words.agents(tree.moreRootAgents),
      },
      stack: [],
    });
  return columns;
}

export function shareCardLayout(tree: OrgTree, words: CardWords): CardLayout {
  const cx = CARD.width / 2;
  const rootNode: CardNode =
    tree.root.kind === "person"
      ? { kind: "person", person: tree.root.person }
      : { kind: "company", name: tree.root.name };
  const rootW = NODE.root.w;
  const boxes: CardBox[] = [
    {
      id: NODE_ID.root,
      node: rootNode,
      shape: "root",
      label:
        tree.root.kind === "person" ? tree.root.person.name : tree.root.name,
      x: cx - rootW / 2,
      y: TREE.rootY,
      w: rootW,
      h: NODE.root.h,
    },
  ];

  const columns = columnsOf(tree, words);
  const n = columns.length;
  const usable = CARD.width - TREE.margin * 2 - TREE.columnGap * (n - 1);
  const w = Math.min(TREE.maxColumn, usable / Math.max(n, 1));
  const left = cx - (w * n + TREE.columnGap * (n - 1)) / 2;

  columns.forEach((column, index) => {
    const x = left + index * (w + TREE.columnGap);
    boxes.push({
      ...column.head,
      shape: "column",
      x,
      y: TREE.rowY,
      w,
      h: NODE.column.h,
    });
    let y = TREE.rowY + NODE.column.h + TREE.gap;
    for (const entry of column.stack) {
      const shape = entry.node.kind === "more" ? "moreLeaf" : "leaf";
      const h = NODE[shape].h;
      boxes.push({ ...entry, shape, x, y, w, h });
      y += h + TREE.gap;
    }
  });

  // A small chart sits centred in the room between header and footer
  // rather than hanging under the header with the bottom half empty.
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  const shift = Math.max(0, (TREE.floor - bottom) / 2);
  for (const box of boxes) box.y += shift;

  const byId = new Map<string, Box>(boxes.map((box) => [box.id, box]));
  const path = connectorPath(treeEdges(tree, "desktop"), byId, {
    radius: TREE.radius,
    spineInset: 0,
  });
  return { boxes, path };
}
