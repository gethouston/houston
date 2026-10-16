import {
  type CardBox,
  type CardFrame,
  type CardLayout,
  type CardNode,
  type CardZoom,
  CHART_WIDTH,
  NODE,
  PORTRAIT_FRAME,
} from "./org-chart-share-card-geometry.ts";
import {
  type CardWords,
  COLUMNS,
  columnSlots,
  columnsOf,
} from "./org-chart-share-columns.ts";
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
 * The image is 4:5 portrait (`PORTRAIT_FRAME`). The root card sits centred
 * under the header, the first row spreads across as equal columns
 * (`org-chart-share-columns.ts`), and each person's AI Employees stack under
 * them, then one "+N" for the rest. The caps (`SHARE_CARD_CAPS`,
 * `shareCardCaps`) keep the worst case inside the room at a zoom of at
 * least 1, so no name or role is ever drawn under `SHARE_MIN_TYPE`.
 */

const TREE = {
  rootY: 252,
  rowY: 394,
  /** Space between stacked cards, which the connector spans. */
  gap: 24,
  radius: 12,
} as const;

/**
 * Scale `boxes` (centred on the frame) into the frame's room, clear of the
 * count line above and the footer below. A small team grows to fill it (up
 * to the frame's `maxZoom`), so three cards never sit as a speck in an empty
 * frame. The sides keep the columns' own margin, so a full row is never
 * shrunk.
 */
function zoomFor(boxes: Box[], frame: CardFrame): CardZoom {
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const { room } = frame;
  const roomH = room.bottom - room.top;
  const scale = Math.min(
    frame.maxZoom,
    (frame.width - COLUMNS.margin * 2) / (right - left),
    roomH / (bottom - top),
  );
  const cx = CHART_WIDTH / 2;
  return {
    scale,
    x: frame.width / 2 - cx * scale,
    y: room.top + (roomH - (bottom - top) * scale) / 2 - top * scale,
  };
}

export function shareCardLayout(
  tree: OrgTree,
  words: CardWords,
  frame: CardFrame = PORTRAIT_FRAME,
): CardLayout {
  const cx = CHART_WIDTH / 2;
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
  const slots = columnSlots(columns);
  const secondRowY = TREE.rowY + NODE.column.h + COLUMNS.rowGap;
  columns.forEach((column, index) => {
    const { x, w, row } = slots[index];
    const top = row === 0 ? TREE.rowY : secondRowY;
    boxes.push({
      ...column.head,
      shape: "column",
      x,
      y: top,
      w,
      h: NODE.column.h,
    });
    let y = top + NODE.column.h + TREE.gap;
    for (const entry of column.stack) {
      const shape = entry.node.kind === "more" ? "moreLeaf" : "leaf";
      const h = NODE[shape].h;
      boxes.push({ ...entry, shape, x, y, w, h });
      y += h + TREE.gap;
    }
  });

  const byId = new Map<string, Box>(boxes.map((box) => [box.id, box]));
  const path = connectorPath(treeEdges(tree, "desktop"), byId, {
    radius: TREE.radius,
    spineInset: 0,
  });
  return { boxes, path, zoom: zoomFor(boxes, frame) };
}
