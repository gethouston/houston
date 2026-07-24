/**
 * Canvas renderer for the {@link SpaceInvaders} shell — every fillText/fillRect
 * of one frame, split out so the component keeps to input wiring and the rAF
 * loop. Pure with respect to the model: it reads {@link GameState}, never
 * mutates it (the swarm's bob is applied at render only — collision stays
 * authoritative on model coords).
 */

import {
  COLS,
  EXPLOSION_TTL,
  type GameState,
  H,
  INV_H,
  INV_W,
  SHIP_W,
  SHIP_Y,
  W,
} from "./space-invaders-defs.ts";

/** Per-spawn-row invader sprites, top to bottom. */
const INVADER_SPRITES = ["👾", "🛸", "👽", "🤖"];

export interface DrawOptions {
  /** Resolved ink color (the canvas's CSS `color`) for HUD text and shots. */
  color: string;
  /** All-time best score, shown top-right. */
  best: number;
  /** Elapsed play seconds — drives the swarm's render-only bob. */
  elapsed: number;
  /** Localized game-over copy: headline (with score) + play-again hint. */
  overLine: string;
  playAgainLine: string;
}

/** Render one frame of `state` onto `canvas` (already sized to DPR). */
export function drawGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: GameState,
  opts: DrawOptions,
): void {
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = opts.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${INV_W}px system-ui, sans-serif`;
  state.invaders.forEach((inv, index) => {
    if (!inv.alive) return;
    const bob = Math.sin(opts.elapsed * 3 + (index % COLS) * 0.7) * 1.5;
    ctx.fillText(
      INVADER_SPRITES[inv.row % INVADER_SPRITES.length],
      inv.x + INV_W / 2,
      inv.y + INV_H / 2 + bob,
    );
  });
  for (const explosion of state.explosions) {
    ctx.globalAlpha = 1 - explosion.age / EXPLOSION_TTL;
    ctx.font = `${14 + (explosion.age / EXPLOSION_TTL) * 6}px system-ui, sans-serif`;
    ctx.fillText("💥", explosion.x, explosion.y);
  }
  ctx.globalAlpha = 1;
  for (const bullet of state.bullets) {
    ctx.beginPath();
    ctx.roundRect(bullet.x - 1, bullet.y - 6, 2, 6, 1);
    ctx.fill();
  }
  ctx.font = "10px system-ui, sans-serif";
  for (const bomb of state.bombs) ctx.fillText("⚡", bomb.x, bomb.y + 5);
  // The rocket glyph natively points up-right 45°; rotate it to point up.
  ctx.save();
  ctx.translate(state.shipX, SHIP_Y);
  ctx.rotate(-Math.PI / 4);
  ctx.font = `${SHIP_W}px system-ui, sans-serif`;
  ctx.fillText("🚀", 0, 0);
  ctx.restore();
  ctx.globalAlpha = 0.7;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`⭐ ${state.score}`, 8, 10);
  ctx.textAlign = "right";
  ctx.fillText(`🏆 ${opts.best}`, W - 8, 10);
  ctx.globalAlpha = 1;
  if (state.over) {
    ctx.textAlign = "center";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(opts.overLine, W / 2, H / 2 - 6);
    ctx.font = "8px system-ui, sans-serif";
    ctx.fillText(opts.playAgainLine, W / 2, H / 2 + 8);
  }
}
