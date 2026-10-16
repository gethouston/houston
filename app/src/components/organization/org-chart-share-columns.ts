import {
  type CardBox,
  type CardNode,
  CHART_WIDTH,
} from "./org-chart-share-card-geometry.ts";
import type { OrgTree, OrgTreeAgent } from "./org-chart-tree.ts";
import { NODE_ID } from "./org-chart-tree-paths.ts";

/**
 * The share image's first row: what goes in it, and where each column sits.
 * Pure and DOM-free.
 */

export const COLUMNS = {
  maxWidth: 260,
  gap: 14,
  margin: 56,
  /** Between the cards of a wrapped row, wide enough for a line to drop through. */
  brickGap: 56,
  /** Between a wrapped row's two lines of cards. */
  rowGap: 48,
} as const;

/** The words the layout writes on cards, all authored `t()` copy. */
export interface CardWords {
  /** "+4 people". */
  morePeople: (count: number) => string;
  /** "+9 AI Employees". */
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
  // The people the cap left out. The header's count line still holds the
  // AI Employees they bring.
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
  /** 0 for the first row, 1 for the wrapped second one. */
  row: 0 | 1;
  w: number;
}

/** `count` cards of the widest width that fits, `gap` apart, centred. */
function row(count: number, gap: number) {
  const usable = CHART_WIDTH - COLUMNS.margin * 2 - gap * (count - 1);
  const w = Math.min(COLUMNS.maxWidth, usable / Math.max(count, 1));
  const left = CHART_WIDTH / 2 - (w * count + gap * (count - 1)) / 2;
  return { w, left, step: w + gap };
}

/**
 * Where each first-row column sits. Five to seven columns with nothing
 * stacked under them (a personal space's AI Employees, or a team whose
 * people have none yet) wrap onto two lines, the second set in the first's
 * gaps so its lines drop between two cards: seven across would leave each
 * name a few letters wide. Seven is the most `SHARE_CARD_CAPS` lets through
 * (a personal space's six AI Employees and its "+N"); eight would put a slot
 * on a card, so anything wider stays one row.
 */
export function columnSlots(columns: readonly Column[]): Slot[] {
  const n = columns.length;
  const flat = columns.every((column) => column.stack.length === 0);
  if (!flat || n < 5 || n > 7) {
    const { w, left, step } = row(n, COLUMNS.gap);
    return columns.map((_, i) => ({ x: left + i * step, row: 0, w }));
  }
  // 5 -> 3 + 2, 6 -> 4 + 2, 7 -> 4 + 3: the second line always fits the
  // first's gaps symmetrically.
  const first = Math.ceil((n + 1) / 2);
  const second = n - first;
  const { w, left, step } = row(first, COLUMNS.brickGap);
  return columns.map((_, i) => {
    if (i < first) return { x: left + i * step, row: 0, w };
    const gap = ((i - first) * (first - 2)) / (second - 1);
    return { x: left + (gap + 0.5) * step, row: 1, w };
  });
}
