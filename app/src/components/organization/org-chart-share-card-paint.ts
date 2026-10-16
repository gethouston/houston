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
  type CardBox,
  type CardFrame,
  type CardLayout,
  NAME_LINES,
  NODE,
  stackedHeight,
} from "./org-chart-share-card-geometry";
import { centred, face, helmetAvatar } from "./org-chart-share-card-marks";
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
      Math.round(s.tile * 0.42),
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
 * A stacked card: its mark, then the name (two lines when it needs them and
 * there is no role), then an AI Employee's role on one line, the whole block
 * centred in the card. A "+N" that has words is the words alone.
 */
function paintStacked(
  ctx: CanvasRenderingContext2D,
  box: CardBox,
  assets: ShareCardAssets,
): void {
  const shape = box.shape === "column" ? "column" : "leaf";
  const s = NODE[shape];
  const { node } = box;
  const cx = box.x + box.w / 2;
  const inner = box.w - 20;
  const role = box.sublabel?.trim() ?? "";
  ctx.font = `600 ${s.name}px ${FONT}`;
  const lines = box.label
    ? wrapLines(ctx, box.label, inner, role ? 1 : NAME_LINES)
    : [];
  // A "+N" with words ("+4 people") says it once, centred, with no mark.
  if (node.kind === "more" && lines.length > 0) {
    let line = box.y + (box.h - lines.length * s.nameLine) / 2;
    ctx.textBaseline = "middle";
    for (const text of lines) {
      const y = line + s.nameLine / 2;
      centred(ctx, text, cx, y, s.name, 600, ART.muted, inner);
      line += s.nameLine;
    }
    ctx.textBaseline = "alphabetic";
    return;
  }
  const roleLines = role ? 1 : 0;
  let y = box.y + (box.h - stackedHeight(shape, lines.length, roleLines)) / 2;
  const markY = y + s.mark / 2;
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
    helmetAvatar(ctx, cx, markY, s.mark, agentAccent(node.agent.color));
  y += s.mark + s.gap;
  ctx.textBaseline = "middle";
  track(ctx, -0.2);
  for (const line of lines) {
    centred(ctx, line, cx, y + s.nameLine / 2, s.name, 600, ART.ink, inner);
    y += s.nameLine;
  }
  track(ctx, 0);
  if (role)
    centred(ctx, role, cx, y + s.roleLine / 2, s.role, 400, ART.muted, inner);
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
  } else paintStacked(ctx, box, assets);
}

/** Paint the whole card onto a context the size of `frame`. */
export function paintShareCard(
  ctx: CanvasRenderingContext2D,
  layout: CardLayout,
  text: ShareCardText,
  assets: ShareCardAssets,
  frame: CardFrame,
): void {
  paintPaper(ctx, frame.width, frame.height);
  paintHeader(ctx, text, frame);
  const { zoom } = layout;
  ctx.save();
  ctx.setTransform(zoom.scale, 0, 0, zoom.scale, zoom.x, zoom.y);
  if (layout.path) {
    ctx.strokeStyle = ART.line;
    ctx.lineWidth = 2.5 / zoom.scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(layout.path));
  }
  for (const box of layout.boxes) paintBox(ctx, box, text, assets);
  ctx.restore();
  paintFooter(ctx, text, assets.mark, frame);
}
