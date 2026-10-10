import { color as tokenColor } from "@houston/design-tokens";
import { personToneClass } from "@houston-ai/board";
import { AGENT_COLORS } from "@houston-ai/core";

/**
 * The share image's art direction: a rendered PNG with its own look, drawn
 * on a canvas that cannot read CSS variables, so its backdrop and ink are
 * authored here (the sanctioned raw-hex exception in DESIGN.md §3.1, like
 * the Agent Store's og-card). Identity colours still come from the tokens:
 * an AI Employee wears its agent colour and a person their person tone.
 */

export const ART = {
  space: "#05060d",
  ink: "#ffffff",
  muted: "rgba(226, 230, 245, 0.66)",
  faint: "rgba(226, 230, 245, 0.42)",
  line: "rgba(200, 210, 255, 0.34)",
  ring: "rgba(255, 255, 255, 0.22)",
  chip: "rgba(255, 255, 255, 0.10)",
  company: ["#6f7fd8", "#2a2f6b"],
  auroraBlue: "rgba(96, 110, 180, 0.42)",
  auroraIndigo: "rgba(120, 90, 200, 0.22)",
  auroraOrange: "rgba(190, 120, 80, 0.22)",
  clear: "rgba(5, 6, 13, 0)",
} as const;

export const FONT =
  'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif';

/** A fixed sky, so the same chart always renders the same image. */
const STARS = [
  [72, 64, 2.4, 0.8],
  [260, 40, 1.6, 0.5],
  [470, 92, 2, 0.6],
  [690, 46, 1.6, 0.45],
  [930, 88, 2.4, 0.7],
  [1130, 52, 1.8, 0.55],
  [1150, 300, 2, 0.5],
  [44, 420, 1.6, 0.4],
  [1160, 700, 2.2, 0.6],
  [36, 860, 2, 0.5],
  [300, 1060, 1.6, 0.45],
  [640, 1180, 2, 0.5],
  [960, 1050, 1.8, 0.55],
  [1140, 1160, 2.4, 0.7],
] as const;

export function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.fillStyle = ART.space;
  ctx.fillRect(0, 0, width, height);
  const glow = (x: number, y: number, r: number, tint: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, tint);
    g.addColorStop(1, ART.clear);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  };
  glow(width * 0.78, height * 0.04, width * 0.75, ART.auroraBlue);
  glow(width * 0.2, height * 0.3, width * 0.55, ART.auroraIndigo);
  glow(width * 0.12, height * 0.96, width * 0.6, ART.auroraOrange);
  ctx.fillStyle = ART.ink;
  for (const [x, y, size, alpha] of STARS) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** An AI Employee's disc fill: its agent colour, or a custom stored hex. */
export function agentFill(stored: string | undefined): string {
  const entry = AGENT_COLORS.find(
    (c) => c.id === stored || c.light === stored || c.dark === stored,
  );
  if (entry) return entry.light;
  if (stored && /^#[0-9a-f]{3,8}$/i.test(stored)) return stored;
  return AGENT_COLORS[0].light;
}

/** A person's initials disc: the same tone their face wears in the app. */
export function personFill(userId: string): string {
  const tone = personToneClass(userId).replace(/^bg-/, "");
  return (tokenColor.light as Record<string, string>)[tone] ?? ART.chip;
}

/** Text cut with an ellipsis to fit `max` at the context's current font. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
): string {
  if (ctx.measureText(text).width <= max) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const cut = `${chars.join("").trimEnd()}…`;
    if (ctx.measureText(cut).width <= max) return cut;
  }
  return "…";
}

/** The largest size (down to `min`) at which `text` fits on one line. */
export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  weight: number,
  from: number,
  min: number,
): number {
  for (let size = from; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= max) return size;
  }
  return min;
}

export function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

/** A disc lit from its top-left, the way the app's metal avatars read. */
export function shadedDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string | CanvasGradient,
): void {
  circle(ctx, x, y, r);
  ctx.fillStyle = fill;
  ctx.fill();
  const sheen = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  sheen.addColorStop(0.55, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = sheen;
  ctx.fill();
  ring(ctx, x, y, r);
}

export function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  circle(ctx, x, y, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = ART.ring;
  ctx.stroke();
}

export function companyFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, ART.company[0]);
  g.addColorStop(1, ART.company[1]);
  return g;
}
