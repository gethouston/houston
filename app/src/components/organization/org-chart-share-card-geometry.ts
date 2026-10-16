import type { ChartPerson } from "./org-chart-people.ts";
import type { OrgTreeAgent } from "./org-chart-tree.ts";
import type { Box } from "./org-chart-tree-paths.ts";

/**
 * The share image's fixed frame and the shapes its layout hands the
 * painter. Pure and DOM-free.
 */

/**
 * A frame the chart is drawn in: its size, its header (the name, then the
 * counts) and footer (the mark and the site), and the band the chart is
 * zoomed into between them. The chart itself is laid out once, in a
 * 1200-unit-wide space, and zoomed to fill the frame's room.
 */
export interface CardFrame {
  width: number;
  height: number;
  /** The margin the header and the footer sit in. */
  pad: number;
  /** Baselines of the name, the counts and the footer. */
  titleY: number;
  countsY: number;
  footerY: number;
  /** The name shrinks from `title` to `titleMin` px before it is cut. */
  type: {
    title: number;
    titleMin: number;
    tracking: number;
    counts: number;
    site: number;
    /** The Houston mark's height. */
    mark: number;
  };
  /** The band the chart is zoomed into, clear of the header and footer. */
  room: { top: number; bottom: number };
  /** How far a small team grows to fill the room. */
  maxZoom: number;
}

/**
 * The share image: 4:5 portrait, 1200 x 1500, the tallest picture LinkedIn's
 * feed shows whole. A chart three levels deep, each person's AI Employees
 * stacked under them, needs height more than width.
 */
export const PORTRAIT_FRAME: CardFrame = {
  width: 1200,
  height: 1500,
  pad: 88,
  titleY: 170,
  countsY: 222,
  footerY: 1428,
  type: {
    title: 84,
    titleMin: 52,
    tracking: -2.5,
    counts: 30,
    site: 22,
    mark: 28,
  },
  room: { top: 292, bottom: 1352 },
  maxZoom: 1.8,
};

/**
 * The smallest a name and a role are ever drawn on the 1200-wide image, so
 * both still read when LinkedIn shows it about 550px wide. A chart that would
 * need smaller type shows fewer cards and a "+N" instead (`SHARE_CARD_CAPS`).
 */
export const SHARE_MIN_TYPE = { name: 30, role: 22 } as const;

/** The width the chart is laid out in, before a frame zooms it. */
export const CHART_WIDTH = 1200;

/**
 * The node shapes, at the minimum type (`SHARE_MIN_TYPE`), so the layout's
 * zoom never goes below 1. `root` is a wide card with a tile and the name;
 * `column` (the first row: people, a personal space's AI Employees, "+N")
 * stacks a 64px mark (a face, or an AI Employee's helmet avatar) over the
 * name; `leaf` (an AI Employee under its person) stacks a smaller helmet over
 * the name. An AI Employee with a role says it under its name, on one line,
 * and its name keeps one line; without one, a name takes up to
 * {@link NAME_LINES}. Every stacked card centres what it holds, so the worst
 * case still fits inside the card.
 */
export const NODE = {
  root: { h: 96, w: 460, tile: 52, name: 32 },
  column: {
    h: 160,
    mark: 64,
    gap: 12,
    name: SHARE_MIN_TYPE.name,
    nameLine: 36,
    role: SHARE_MIN_TYPE.role,
    roleLine: 28,
  },
  leaf: {
    h: 124,
    mark: 36,
    gap: 8,
    name: SHARE_MIN_TYPE.name,
    nameLine: 36,
    role: SHARE_MIN_TYPE.role,
    roleLine: 28,
  },
  moreLeaf: { h: 56, name: SHARE_MIN_TYPE.name },
} as const;

/** The least room left between a stacked card's content and its edges. */
export const CARD_PADDING = 4;

export type StackedShape = "column" | "leaf";

/** A name with no role under it may take two lines. */
export const NAME_LINES = 2;

/** How tall a stacked card's content is, mark included. */
export function stackedHeight(
  shape: StackedShape,
  nameLines: number,
  roleLines = 0,
): number {
  const s = NODE[shape];
  const text = nameLines * s.nameLine + roleLines * s.roleLine;
  return s.mark + (text > 0 ? s.gap + text : 0);
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
  /** The name, wrapped and cut to the card's width when painted. */
  label?: string;
  /** An AI Employee's role, one line under its name. */
  sublabel?: string;
}

/** Card point = chart point x scale + (x, y). */
export interface CardZoom {
  scale: number;
  x: number;
  y: number;
}

export interface CardLayout {
  /** In chart units; {@link CardLayout.zoom} places them on the card. */
  boxes: CardBox[];
  /** Every connector as one SVG path, for `Path2D`, in chart units. */
  path: string;
  zoom: CardZoom;
}

/** Where `box` lands on the card once zoomed. */
export function onCard(zoom: CardZoom, box: Box): Box {
  return {
    x: box.x * zoom.scale + zoom.x,
    y: box.y * zoom.scale + zoom.y,
    w: box.w * zoom.scale,
    h: box.h * zoom.scale,
  };
}
