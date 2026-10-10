import { initialsFor } from "@houston-ai/board";
import {
  ART,
  agentAccent,
  paintCard,
  paintPaper,
  roundRect,
  track,
} from "./org-chart-share-card-art";
import {
  paintFooter,
  paintHeader,
  type ShareCardText,
} from "./org-chart-share-card-frame";
import {
  CARD,
  type CardBox,
  type CardLayout,
  lineBudget,
  NAME_LINES,
  NODE,
  stackedHeight,
} from "./org-chart-share-card-geometry";
import { accent, centred, face } from "./org-chart-share-card-marks";
import { FONT, fitText, wrapLines } from "./org-chart-share-card-text";

export type { ShareCardText };

/** Images already loaded and checked safe to draw. */
export interface ShareCardAssets {
  /** Person photos by userId; a person missing here wears initials. */
  photos: ReadonlyMap<string, CanvasImageSource>;
  /** The dark Houston mark for the footer, or `null` when it did not load. */
  mark: CanvasImageSource | null;
}

/** The root: its tile (or face) and name, centred together in the card. */
function paintRoot(
  ctx: CanvasRenderingContext2D,
  box: CardBox,
  assets: ShareCardAssets,
): void {
  const s = NODE.root;
  const label = box.label ?? "";
  ctx.font = `650 ${s.name}px ${FONT}`;
  track(ctx, -0.4);
  const name = fitText(ctx, label, box.w - 40 - s.tile - 16);
  const nameW = ctx.measureText(name).width;
  track(ctx, 0);
  const x = box.x + (box.w - (s.tile + 16 + nameW)) / 2;
  const cy = box.y + box.h / 2;
  if (box.node.kind === "person")
    face(
      ctx,
      x + s.tile / 2,
      cy,
      s.tile,
      label,
      assets.photos.get(box.node.person.userId),
    );
  else {
    roundRect(ctx, x, cy - s.tile / 2, s.tile, s.tile, 12);
    ctx.fillStyle = ART.tile;
    ctx.fill();
    ctx.textBaseline = "middle";
    centred(
      ctx,
      initialsFor(label),
      x + s.tile / 2,
      cy + 1,
      18,
      600,
      ART.tileInk,
      s.tile,
    );
    ctx.textBaseline = "alphabetic";
  }
  ctx.font = `650 ${s.name}px ${FONT}`;
  track(ctx, -0.4);
  ctx.fillStyle = ART.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(name, x + s.tile + 16, cy + 1);
  ctx.textBaseline = "alphabetic";
  track(ctx, 0);
}

/**
 * A stacked card: its mark, then the name (two lines when it needs them)
 * and the muted role, the whole block centred in the card.
 */
function paintStacked(
  ctx: CanvasRenderingContext2D,
  box: CardBox,
  text: ShareCardText,
  assets: ShareCardAssets,
): void {
  const s = box.shape === "column" ? NODE.column : NODE.leaf;
  const { node } = box;
  const cx = box.x + box.w / 2;
  const inner = box.w - 20;
  ctx.font = `600 ${s.name}px ${FONT}`;
  const shape = box.shape === "column" ? "column" : "leaf";
  const lines = box.label ? wrapLines(ctx, box.label, inner, NAME_LINES) : [];
  ctx.font = `400 ${s.role}px ${FONT}`;
  const roleLines = lineBudget(shape, lines.length);
  const roles =
    box.sublabel && roleLines > 0
      ? wrapLines(ctx, box.sublabel, inner, roleLines)
      : [];
  let y =
    box.y + (box.h - stackedHeight(shape, lines.length, roles.length)) / 2;
  const markY = y + s.extent / 2;
  if (node.kind === "person")
    face(
      ctx,
      cx,
      markY,
      s.mark,
      node.person.name,
      assets.photos.get(node.person.userId),
    );
  else if (node.kind === "agent")
    accent(ctx, cx, markY, s.dot, s.halo, agentAccent(node.agent.color));
  else if (node.kind === "more") {
    ctx.textBaseline = "middle";
    centred(ctx, text.more(node.count), cx, markY, 30, 650, ART.ink, inner);
    ctx.textBaseline = "alphabetic";
  }
  y += s.extent + s.gap;
  ctx.textBaseline = "middle";
  track(ctx, -0.2);
  for (const line of lines) {
    centred(ctx, line, cx, y + s.nameLine / 2, s.name, 600, ART.ink, inner);
    y += s.nameLine;
  }
  track(ctx, 0);
  for (const line of roles) {
    centred(ctx, line, cx, y + s.roleLine / 2, s.role, 400, ART.muted, inner);
    y += s.roleLine;
  }
  ctx.textBaseline = "alphabetic";
}

function paintBox(
  ctx: CanvasRenderingContext2D,
  box: CardBox,
  text: ShareCardText,
  assets: ShareCardAssets,
): void {
  paintCard(ctx, box, box.node.kind === "more");
  if (box.shape === "root") paintRoot(ctx, box, assets);
  else if (box.shape === "moreLeaf") {
    if (box.node.kind !== "more") return;
    ctx.textBaseline = "middle";
    centred(
      ctx,
      text.more(box.node.count),
      box.x + box.w / 2,
      box.y + box.h / 2,
      NODE.moreLeaf.name,
      600,
      ART.muted,
      box.w - 20,
    );
    ctx.textBaseline = "alphabetic";
  } else paintStacked(ctx, box, text, assets);
}

/** Paint the whole card onto a CARD-sized context. */
export function paintShareCard(
  ctx: CanvasRenderingContext2D,
  layout: CardLayout,
  text: ShareCardText,
  assets: ShareCardAssets,
): void {
  paintPaper(ctx, CARD.width, CARD.height);
  paintHeader(ctx, text);
  if (layout.path) {
    ctx.strokeStyle = ART.line;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(layout.path));
  }
  for (const box of layout.boxes) paintBox(ctx, box, text, assets);
  paintFooter(ctx, text, assets.mark);
}
