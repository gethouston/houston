import { AGENT_COLORS } from "@houston-ai/core";

/**
 * The share image's art direction: a rendered PNG with its own look, drawn
 * on a canvas that cannot read CSS variables, so its paper, ink and shadows
 * are authored here (the sanctioned raw-hex exception in DESIGN.md §3.1,
 * like the Agent Store's og-card). Clean and light on purpose: it lands in
 * a white feed. AI Employees still wear their own token colour as an accent.
 */

export const ART = {
  paper: "#fafaf9",
  dot: "rgba(17, 17, 16, 0.075)",
  ink: "#111110",
  muted: "#6b6b66",
  faint: "#9a9a94",
  card: "#ffffff",
  hairline: "#e7e7e4",
  line: "#d4d4d0",
  initialsFill: "#efefec",
  initialsInk: "#3d3d39",
  tile: "#111110",
  tileInk: "#ffffff",
  moreFill: "#f3f3f1",
  shadowNear: "rgba(17, 17, 16, 0.05)",
  shadowFar: "rgba(17, 17, 16, 0.06)",
} as const;

/** The dot grid's pitch and dot radius. */
const GRID = { step: 24, r: 1.1 } as const;

export function paintPaper(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.fillStyle = ART.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = ART.dot;
  for (let y = GRID.step / 2; y < height; y += GRID.step)
    for (let x = GRID.step / 2; x < width; x += GRID.step) {
      ctx.beginPath();
      ctx.arc(x, y, GRID.r, 0, Math.PI * 2);
      ctx.fill();
    }
}

/** An AI Employee's accent: its agent colour, or a custom stored hex. */
export function agentAccent(stored: string | undefined): string {
  const entry = AGENT_COLORS.find(
    (c) => c.id === stored || c.light === stored || c.dark === stored,
  );
  if (entry) return entry.light;
  if (stored && /^#[0-9a-f]{3,8}$/i.test(stored)) return stored;
  return AGENT_COLORS[0].light;
}

/** Tighten tracking where the canvas supports it (no-op elsewhere). */
export function track(ctx: CanvasRenderingContext2D, px: number): void {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A white card: two soft shadow layers (a close contact shadow and a wide
 * ambient one), then a hairline edge. `quiet` cards (the "+N") sit flat on
 * a light fill with the edge only.
 */
export function paintCard(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  quiet = false,
): void {
  const r = 16;
  ctx.save();
  if (!quiet)
    for (const [color, blur, dy] of [
      [ART.shadowFar, 24, 8],
      [ART.shadowNear, 3, 1],
    ] as const) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = dy;
      roundRect(ctx, box.x, box.y, box.w, box.h, r);
      ctx.fillStyle = ART.card;
      ctx.fill();
    }
  ctx.restore();
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, r);
  ctx.fillStyle = quiet ? ART.moreFill : ART.card;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ART.hairline;
  ctx.stroke();
}
