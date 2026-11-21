import {
  type CardBox,
  type CardNode,
  CHART_WIDTH,
} from "./org-chart-share-card-geometry.ts";
import type { OrgTree, OrgTreeAgent } from "./org-chart-tree.ts";
import { NODE_ID } from "./org-chart-tree-paths.ts";

export const COLUMNS = {
  maxWidth: 260,
  gap: 14,
  margin: 56,
  brickGap: 56,
  rowGap: 48,
} as const;

export interface CardWords {
  morePeople: (count: number) => string;
  moreAgents: (count: number) => string;
}

type Entry = Omit<CardBox, "x" | "y" | "w" | "h" | "shape">;

export interface Column {
  head: Entry;
  stack: Entry[];
}

export function columnsOf(tree: OrgTree, words: CardWords): Column[] {
  const agentEntry = (agent: OrgTreeAgent): Entry => ({
    id: NODE_ID.agent(agent.id),
    node: { kind: "agent", agent },
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
      },
      stack,
    };
  });
  if (tree.morePeople > 0)
    columns.push({
      head: {
        ...more(NODE_ID.morePeople, tree.morePeople),
        label: words.morePeople(tree.morePeople),
      },
      stack: [],
    });
  for (const agent of tree.rootAgents)
    columns.push({ head: agentEntry(agent), stack: [] });
  if (tree.moreRootAgents > 0)
    columns.push({
      head: {
        ...more(NODE_ID.moreRoot, tree.moreRootAgents),
        label: words.moreAgents(tree.moreRootAgents),
      },
      stack: [],
    });
  return columns;
}

export interface Slot {
  x: number;
  row: 0 | 1;
  w: number;
}

function row(count: number, gap: number) {
  const usable = CHART_WIDTH - COLUMNS.margin * 2 - gap * (count - 1);
  const w = Math.min(COLUMNS.maxWidth, usable / Math.max(count, 1));
  const left = CHART_WIDTH / 2 - (w * count + gap * (count - 1)) / 2;
  return { w, left, step: w + gap };
}

export function columnSlots(columns: readonly Column[]): Slot[] {
  const n = columns.length;
  const flat = columns.every((column) => column.stack.length === 0);
  if (!flat || n < 5 || n > 7) {
    const { w, left, step } = row(n, COLUMNS.gap);
    return columns.map((_, i) => ({ x: left + i * step, row: 0, w }));
  }
  const first = Math.ceil((n + 1) / 2);
  const second = n - first;
  const { w, left, step } = row(first, COLUMNS.brickGap);
  return columns.map((_, i) => {
    if (i < first) return { x: left + i * step, row: 0, w };
    const gap = ((i - first) * (first - 2)) / (second - 1);
    return { x: left + (gap + 0.5) * step, row: 1, w };
  });
}
