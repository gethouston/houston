/**
 * Geometry constants and state shapes for the {@link SpaceInvaders} easter egg
 * — the data half of the game. The rules (`spawnInvaders`, `step`, …) live in
 * `space-invaders-model.ts`; frame rendering in `space-invaders-draw.ts`.
 */

// Fixed internal resolution; the canvas is scaled to its container via CSS and
// devicePixelRatio, so play reads crisp at any width without re-laying-out.
export const W = 320;
export const H = 240;
export const ROWS = 4;
export const COLS = 8;
export const INV_W = 16;
export const INV_H = 14;
export const GAP_X = 14;
export const GAP_Y = 8;
export const SHIP_W = 22;
export const SHIP_Y = H - 16;
export const SHIP_SPEED = 150; // px/s from held keys
export const BULLET_SPEED = 260;
export const BOMB_SPEED = 90;
/** Seconds a kill's 💥 stays on screen (fading) before it is pruned. */
export const EXPLOSION_TTL = 0.35;
/** Most player bullets allowed in flight at once. */
export const MAX_BULLETS = 3;

export interface Invader {
  x: number;
  y: number;
  /** 0-based spawn row — picks the invader's sprite. */
  row: number;
  alive: boolean;
}
export interface Shot {
  x: number;
  y: number;
}
export interface Explosion {
  x: number;
  y: number;
  /** Seconds since the kill; render alpha fades toward EXPLOSION_TTL. */
  age: number;
}
export interface GameState {
  invaders: Invader[];
  /** Swarm horizontal direction, +1 / -1. */
  dir: number;
  shipX: number;
  bullets: Shot[];
  bombs: Shot[];
  explosions: Explosion[];
  score: number;
  over: boolean;
  /** Seconds until the next enemy bomb may drop. */
  bombTimer: number;
}
/** Per-frame input: held movement keys + the elapsed seconds. */
export interface StepInput {
  left: boolean;
  right: boolean;
  dt: number;
}
