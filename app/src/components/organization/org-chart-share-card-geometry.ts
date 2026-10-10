import type { ChartPerson } from "./org-chart-people.ts";
import type { OrgTreeAgent } from "./org-chart-tree.ts";
import type { Box } from "./org-chart-tree-paths.ts";

/**
 * The share image's fixed frame and the shapes its layout hands the
 * painter. Pure and DOM-free.
 */

export const CARD = { width: 1200, height: 1200, pad: 88 } as const;

/** Baselines of the header lines over the chart, and of the footer. */
export const CARD_TEXT = {
  kickerY: 112,
  titleY: 192,
  countsY: 242,
  footerY: 1128,
} as const;

/**
 * The node shapes. `root` is a wide card with a tile and the name; `column`
 * (the first row: people, a personal space's AI Employees, "+N") stacks a
 * 56px mark over the name and a role line; `leaf` (an AI Employee under its
 * person) stacks a colour dot in its halo over the same two lines. Every
 * stacked card centres what it holds, and what it holds is budgeted
 * ({@link lineBudget}) so the worst case still fits inside the card. The
 * type sizes stay legible when LinkedIn shows the image around 550px wide
 * (0.46x): a 24px name lands near 11px.
 *
 * `extent` is how tall the mark really paints: a leaf's halo reaches past
 * its dot, so the block is measured from the halo.
 */
export const NODE = {
  root: { h: 80, w: 420, tile: 44, name: 28 },
  column: {
    h: 176,
    mark: 56,
    extent: 56,
    dot: 11,
    halo: 21,
    gap: 12,
    name: 24,
    nameLine: 28,
    role: 19,
    roleLine: 26,
  },
  leaf: {
    h: 116,
    mark: 16,
    extent: 27,
    dot: 7,
    halo: 13.5,
    gap: 8,
    name: 21,
    nameLine: 25,
    role: 17,
    roleLine: 23,
  },
  moreLeaf: { h: 48, name: 21 },
} as const;

/** The least room left between a stacked card's content and its edges. */
export const CARD_PADDING = 4;

export type StackedShape = "column" | "leaf";

/** A name may take two lines. */
export const NAME_LINES = 2;

/**
 * How many lines the role may take beside a name of `nameLines`: three
 * lines between them, and never more than two (a leaf's role, one).
 */
export function lineBudget(shape: StackedShape, nameLines: number): number {
  const most = shape === "leaf" ? 1 : 2;
  return Math.max(0, Math.min(most, 3 - nameLines));
}

/** How tall a stacked card's content is, mark (or halo) included. */
export function stackedHeight(
  shape: StackedShape,
  nameLines: number,
  roleLines: number,
): number {
  const s = NODE[shape];
  return (
    s.extent +
    (nameLines > 0 ? s.gap + nameLines * s.nameLine : 0) +
    roleLines * s.roleLine
  );
}

export type CardNode =
  | { kind: "company"; name: string }
  | { kind: "person"; person: ChartPerson }
  | { kind: "agent"; agent: OrgTreeAgent }
  | { kind: "more"; count: number };

export type CardShape = "root" | "column" | "leaf" | "moreLeaf";

export interface CardBox extends Box {
  id: string;
  node: CardNode;
  shape: CardShape;
  /** The name line, cut to the card's width when painted. */
  label?: string;
  /** The muted line under it. */
  sublabel?: string;
}

export interface CardLayout {
  boxes: CardBox[];
  /** Every connector as one SVG path, for `Path2D`. */
  path: string;
}
