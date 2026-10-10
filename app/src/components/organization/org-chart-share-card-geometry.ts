import type { ChartPerson } from "./org-chart-people.ts";
import type { OrgTreeAgent } from "./org-chart-tree.ts";

/**
 * The share image's fixed frame and the shapes its layout hands the
 * painter. Pure and DOM-free.
 */

export const CARD = { width: 1200, height: 1200, pad: 80 } as const;

/** The header block over the tree and the footer under it. */
export const CARD_TEXT = {
  kickerY: 116,
  titleY: 196,
  countsY: 252,
  footerY: 1124,
} as const;

/**
 * The name and role lines under a disc: baselines below the disc's bottom
 * edge, font sizes, and the block's full depth (descenders included).
 */
export const LABEL = {
  big: { name: 32, role: 58, nameSize: 24, roleSize: 19, depth: 64 },
  small: { name: 26, role: 48, nameSize: 20, roleSize: 16, depth: 54 },
} as const;

export type CardNode =
  | { kind: "company"; name: string }
  | { kind: "person"; person: ChartPerson }
  | { kind: "agent"; agent: OrgTreeAgent }
  | { kind: "more"; count: number };

export interface CardDisc {
  node: CardNode;
  x: number;
  y: number;
  r: number;
  /** Text under the disc, centred, cut to `labelWidth`. */
  label?: string;
  sublabel?: string;
  labelWidth: number;
  /** `big` on the chart's first row, `small` for the AI Employees under it. */
  labelSize: keyof typeof LABEL;
}

export interface CardLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CardLayout {
  discs: CardDisc[];
  lines: CardLine[];
}
