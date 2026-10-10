import type { OrgTree } from "./org-chart-tree.ts";

/**
 * The org chart's connectors as geometry. Pure and DOM-free: the on-screen
 * chart measures its nodes and the share image places its own, and both
 * hand the boxes here, so the lines are the same shape everywhere and always
 * start and end on a node (never in empty space, never past the last one).
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How a child hangs off its parent.
 * - `bus`: down from the parent's bottom centre, across at the midpoint,
 *   down into the child's top centre (the desktop people row).
 * - `spine`: down a rail `spineInset` in from the parent's left edge, then
 *   across into the child's left edge at its middle (the phone outline).
 * - `chain`: straight down from the parent's bottom centre into the child's
 *   top centre (a stack of AI Employees under their person).
 */
export type EdgeKind = "bus" | "spine" | "chain";

export interface Edge {
  parent: string;
  child: string;
  kind: EdgeKind;
}

type Point = readonly [number, number];

const fmt = (n: number) => Number(n.toFixed(2));

/**
 * An SVG path through `points` with each corner rounded by up to `radius`
 * (never more than half the shorter neighbouring segment, so tight elbows
 * stay clean). Path2D accepts the same string, so the canvas reuses it.
 */
export function roundedPath(points: readonly Point[], radius: number): string {
  if (points.length < 2) return "";
  const [x0, y0] = points[0];
  let d = `M${fmt(x0)} ${fmt(y0)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r <= 0) {
      d += ` L${fmt(cx)} ${fmt(cy)}`;
      continue;
    }
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    d += ` L${fmt(ax)} ${fmt(ay)} Q${fmt(cx)} ${fmt(cy)} ${fmt(bx)} ${fmt(by)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${fmt(lx)} ${fmt(ly)}`;
}

export interface PathOptions {
  radius: number;
  /** The spine's distance in from the parent's left edge. */
  spineInset: number;
}

function edgePoints(
  kind: EdgeKind,
  p: Box,
  c: Box,
  busY: number,
  spineInset: number,
): Point[] {
  const pcx = p.x + p.w / 2;
  const ccx = c.x + c.w / 2;
  const bottom = p.y + p.h;
  if (kind === "chain")
    return [
      [pcx, bottom],
      [pcx, c.y],
    ];
  if (kind === "spine") {
    const sx = p.x + spineInset;
    const mid = c.y + c.h / 2;
    return [
      [sx, bottom],
      [sx, mid],
      [c.x, mid],
    ];
  }
  if (Math.abs(pcx - ccx) < 0.5)
    return [
      [pcx, bottom],
      [ccx, c.y],
    ];
  return [
    [pcx, bottom],
    [pcx, busY],
    [ccx, busY],
    [ccx, c.y],
  ];
}

/**
 * Every edge as one path string: one stroke, so a trunk shared by several
 * children is painted once and never darkens where the lines overlap.
 * Edges whose ends are not on the page yet are skipped.
 */
export function connectorPath(
  edges: readonly Edge[],
  boxes: ReadonlyMap<string, Box>,
  options: PathOptions,
): string {
  // A parent's bus runs halfway between it and its highest child.
  const busY = new Map<string, number>();
  for (const edge of edges) {
    const p = boxes.get(edge.parent);
    const c = boxes.get(edge.child);
    if (edge.kind !== "bus" || !p || !c) continue;
    const mid = (p.y + p.h + c.y) / 2;
    busY.set(edge.parent, Math.min(busY.get(edge.parent) ?? mid, mid));
  }
  return edges
    .flatMap((edge) => {
      const p = boxes.get(edge.parent);
      const c = boxes.get(edge.child);
      if (!p || !c) return [];
      const y = busY.get(edge.parent) ?? 0;
      const points = edgePoints(edge.kind, p, c, y, options.spineInset);
      return [roundedPath(points, options.radius)];
    })
    .join(" ");
}

/** The node ids both renderers give the tree's parts. */
export const NODE_ID = {
  root: "root",
  person: (userId: string) => `p:${userId}`,
  agent: (agentId: string) => `a:${agentId}`,
  morePeople: "more:people",
  moreAgents: (userId: string) => `more:${userId}`,
  moreRoot: "more:root",
} as const;

/**
 * The tree's edges. `row` joins the root to its first level (`bus` across
 * on desktop, `spine` down the phone outline); each person's AI Employees
 * stack under them as `chain` on desktop and `spine` on the phone.
 */
export function treeEdges(tree: OrgTree, layout: "desktop" | "phone"): Edge[] {
  const row: EdgeKind = layout === "desktop" ? "bus" : "spine";
  const stack: EdgeKind = layout === "desktop" ? "chain" : "spine";
  const edges: Edge[] = [];
  const level = (child: string) =>
    edges.push({ parent: NODE_ID.root, child, kind: row });
  for (const branch of tree.branches) {
    const person = NODE_ID.person(branch.person.userId);
    level(person);
    // A chain links each AI Employee to the one above it; a spine hangs
    // them all off the person.
    let above = person;
    const children = branch.agents.map((a) => NODE_ID.agent(a.id));
    if (branch.moreAgents > 0)
      children.push(NODE_ID.moreAgents(branch.person.userId));
    for (const child of children) {
      edges.push({
        parent: stack === "chain" ? above : person,
        child,
        kind: stack,
      });
      above = child;
    }
  }
  if (tree.morePeople > 0) level(NODE_ID.morePeople);
  for (const agent of tree.rootAgents) level(NODE_ID.agent(agent.id));
  if (tree.moreRootAgents > 0) level(NODE_ID.moreRoot);
  return edges;
}
