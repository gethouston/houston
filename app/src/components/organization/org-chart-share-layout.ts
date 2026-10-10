import type { ChartPerson } from "./org-chart-people.ts";
import {
  CARD,
  type CardDisc,
  type CardLayout,
  type CardLine,
  type CardNode,
  LABEL,
} from "./org-chart-share-card-geometry.ts";
import type { OrgTree, OrgTreeAgent } from "./org-chart-tree.ts";

/**
 * Where everything sits on the share image. Pure and DOM-free: the drawing
 * module only paints what this places.
 *
 * The card is square (1200 x 1200): a chart three levels deep, with each
 * person's AI Employees stacked under them, needs height more than width,
 * and a square image takes the most room LinkedIn's feed gives a post.
 * Under each person up to `SHARE_CARD_CAPS.agentsPerPerson` AI Employees
 * stack, then one "+N" disc for the rest.
 */

const TREE = {
  rootY: 340,
  busY: 420,
  levelY: 480,
  maxColumn: 260,
  margin: 56,
  /** Space between a label block and the next disc: gap, line, gap. */
  link: 30,
  /** Where a connector stops short of a label or a disc. */
  gap: 8,
} as const;

const R = { root: 44, person: 40, levelAgent: 36, agent: 26, more: 22 };

type Column =
  | {
      kind: "person";
      person: ChartPerson;
      agents: OrgTreeAgent[];
      more: number;
    }
  | { kind: "agent"; agent: OrgTreeAgent }
  | { kind: "more"; count: number; label: string; sublabel?: string };

/** The words the layout writes under discs, all authored `t()` copy. */
export interface CardWords {
  role: (person: ChartPerson) => string;
  /** "4 people". */
  people: (count: number) => string;
  /** "9 AI Employees". */
  agents: (count: number) => string;
}

function columnsOf(tree: OrgTree, words: CardWords): Column[] {
  const columns: Column[] = tree.branches.map((branch) => ({
    kind: "person",
    person: branch.person,
    agents: branch.agents,
    more: branch.moreAgents,
  }));
  // The people the cap left out, with the AI Employees they bring, so the
  // card's totals still add up.
  if (tree.morePeople > 0)
    columns.push({
      kind: "more",
      count: tree.morePeople,
      label: words.people(tree.morePeople),
      sublabel:
        tree.morePeopleAgents > 0
          ? words.agents(tree.morePeopleAgents)
          : undefined,
    });
  for (const agent of tree.rootAgents) columns.push({ kind: "agent", agent });
  if (tree.moreRootAgents > 0)
    columns.push({
      kind: "more",
      count: tree.moreRootAgents,
      label: words.agents(tree.moreRootAgents),
    });
  return columns;
}

export function shareCardLayout(tree: OrgTree, words: CardWords): CardLayout {
  const discs: CardDisc[] = [];
  const lines: CardLine[] = [];
  const cx = CARD.width / 2;
  const rootNode: CardNode =
    tree.root.kind === "person"
      ? { kind: "person", person: tree.root.person }
      : { kind: "company", name: tree.root.name };
  discs.push({
    node: rootNode,
    x: cx,
    y: TREE.rootY,
    r: R.root,
    labelWidth: 0,
    labelSize: "big",
  });

  const columns = columnsOf(tree, words);
  if (columns.length === 0) return { discs, lines };
  const usable = CARD.width - TREE.margin * 2;
  const width = Math.min(TREE.maxColumn, usable / columns.length);
  const left = cx - (width * columns.length) / 2;
  const xs = columns.map((_, index) => left + width * (index + 0.5));

  lines.push({ x1: cx, y1: TREE.rootY + R.root, x2: cx, y2: TREE.busY });
  lines.push({
    x1: xs[0],
    y1: TREE.busY,
    x2: xs[xs.length - 1],
    y2: TREE.busY,
  });

  columns.forEach((column, index) => {
    const x = xs[index];
    const r =
      column.kind === "person"
        ? R.person
        : column.kind === "agent"
          ? R.levelAgent
          : R.more;
    lines.push({ x1: x, y1: TREE.busY, x2: x, y2: TREE.levelY - r });
    const labelWidth = width - 16;
    if (column.kind === "more") {
      discs.push({
        node: { kind: "more", count: column.count },
        label: column.label,
        sublabel: column.sublabel,
        x,
        y: TREE.levelY,
        r,
        labelWidth,
        labelSize: "big",
      });
      return;
    }
    if (column.kind === "agent") {
      const { agent } = column;
      discs.push({
        node: column,
        x,
        y: TREE.levelY,
        r,
        label: agent.name,
        sublabel: agent.role,
        labelWidth,
        labelSize: "big",
      });
      return;
    }
    discs.push({
      node: { kind: "person", person: column.person },
      x,
      y: TREE.levelY,
      r,
      label: column.person.name,
      sublabel: words.role(column.person),
      labelWidth,
      labelSize: "big",
    });
    let above = TREE.levelY + r + LABEL.big.depth;
    const stack: CardNode[] = column.agents.map((agent) => ({
      kind: "agent",
      agent,
    }));
    if (column.more > 0) stack.push({ kind: "more", count: column.more });
    for (const node of stack) {
      const nodeR = node.kind === "more" ? R.more : R.agent;
      const y = above + TREE.link + nodeR;
      lines.push({
        x1: x,
        y1: above + TREE.gap,
        x2: x,
        y2: y - nodeR - TREE.gap,
      });
      discs.push({
        node,
        x,
        y,
        r: nodeR,
        label: node.kind === "agent" ? node.agent.name : undefined,
        sublabel: node.kind === "agent" ? node.agent.role : undefined,
        labelWidth,
        labelSize: "small",
      });
      above = y + nodeR + LABEL.small.depth;
    }
  });
  return { discs, lines };
}
