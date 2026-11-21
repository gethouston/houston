import type { ChartPerson } from "./org-chart-people.ts";
import type { OrgTreeAgent } from "./org-chart-tree.ts";
import type { Box } from "./org-chart-tree-paths.ts";

export interface CardFrame {
  width: number;
  height: number;
  pad: number;
  titleY: number;
  countsY: number;
  footerY: number;
  type: {
    title: number;
    titleMin: number;
    tracking: number;
    counts: number;
    site: number;
    mark: number;
  };
  room: { top: number; bottom: number };
  maxZoom: number;
}

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

export const SHARE_MIN_TYPE = { name: 30, role: 22 } as const;

export const CHART_WIDTH = 1200;

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

export const CARD_PADDING = 4;

export type StackedShape = "column" | "leaf";

export const NAME_LINES = 2;

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
  label?: string;
  sublabel?: string;
}

export interface CardZoom {
  scale: number;
  x: number;
  y: number;
}

export interface CardLayout {
  boxes: CardBox[];
  path: string;
  zoom: CardZoom;
}

export function onCard(zoom: CardZoom, box: Box): Box {
  return {
    x: box.x * zoom.scale + zoom.x,
    y: box.y * zoom.scale + zoom.y,
    w: box.w * zoom.scale,
    h: box.h * zoom.scale,
  };
}
