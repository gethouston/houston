/**
 * Pure model for the {@link SpaceInvaders} canvas easter egg — every rule of
 * the game that can be reasoned about without a canvas: the fixed-resolution
 * geometry, the state shape, and a deterministic `step`. The React/canvas shell
 * (`space-invaders.tsx`) owns only rendering and input wiring, so this file is
 * unit-testable under `node --test` (see `app/tests/space-invaders-model.ts`).
 */

// Fixed internal resolution; the canvas is scaled to its container via CSS and
// devicePixelRatio, so play reads crisp at any width without re-laying-out.
export const W = 320;
export const H = 240;
export const ROWS = 4;
export const COLS = 8;
export const INV_W = 16;
export const INV_H = 10;
const GAP_X = 14;
const GAP_Y = 12;
export const SHIP_W = 22;
export const SHIP_H = 8;
export const SHIP_Y = H - 16;
const SHIP_SPEED = 150; // px/s from held keys
const BULLET_SPEED = 260;
const BOMB_SPEED = 90;
/** Most player bullets allowed in flight at once. */
const MAX_BULLETS = 3;

export interface Invader {
  x: number;
  y: number;
  alive: boolean;
}
export interface Shot {
  x: number;
  y: number;
}
export interface GameState {
  invaders: Invader[];
  /** Swarm horizontal direction, +1 / -1. */
  dir: number;
  shipX: number;
  bullets: Shot[];
  bombs: Shot[];
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

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** A fresh, centered 4×8 swarm. */
export function spawnInvaders(): Invader[] {
  const list: Invader[] = [];
  const left = (W - (COLS * (INV_W + GAP_X) - GAP_X)) / 2;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      list.push({
        x: left + c * (INV_W + GAP_X),
        y: 24 + r * (INV_H + GAP_Y),
        alive: true,
      });
  return list;
}

export function createState(): GameState {
  return {
    invaders: spawnInvaders(),
    dir: 1,
    shipX: W / 2,
    bullets: [],
    bombs: [],
    score: 0,
    over: false,
    bombTimer: 0,
  };
}

/** Restart from scratch (score included) after a game over. */
export function reset(s: GameState): void {
  Object.assign(s, createState());
}

/** Point the ship at a logical x (used by pointer steering), clamped in-bounds. */
export function steer(s: GameState, x: number): void {
  s.shipX = clamp(x, SHIP_W / 2, W - SHIP_W / 2);
}

/** Fire a bullet, unless the game is over or the in-flight cap is reached. */
export function shoot(s: GameState): void {
  if (!s.over && s.bullets.length < MAX_BULLETS)
    s.bullets.push({ x: s.shipX, y: SHIP_Y });
}

/**
 * Advance the simulation by one frame (mutates `s`). `rng` is injectable so the
 * enemy-bomb cadence is deterministic under test; it defaults to `Math.random`.
 * No-op once the game is over — the shell waits for input to {@link reset}.
 */
export function step(
  s: GameState,
  input: StepInput,
  rng: () => number = Math.random,
): void {
  if (s.over) return;
  const { dt } = input;
  if (input.left) s.shipX -= SHIP_SPEED * dt;
  if (input.right) s.shipX += SHIP_SPEED * dt;
  s.shipX = clamp(s.shipX, SHIP_W / 2, W - SHIP_W / 2);

  let live = s.invaders.filter((i) => i.alive);
  if (live.length === 0) {
    // Swarm cleared: respawn (faster, since it starts full again), keep score.
    s.invaders = spawnInvaders();
    s.dir = 1;
    live = s.invaders;
  }
  // Speed scales up as the swarm thins (min 12, ramping toward ~90 px/s).
  const speed = 12 + (1 - live.length / (ROWS * COLS)) * 78;
  let hitEdge = false;
  for (const inv of live) {
    inv.x += s.dir * speed * dt;
    if (inv.x < 4 || inv.x + INV_W > W - 4) hitEdge = true;
  }
  if (hitEdge) {
    s.dir *= -1;
    for (const inv of live) inv.y += INV_H;
  }
  for (const inv of live) if (inv.y + INV_H >= SHIP_Y) s.over = true;

  // Enemy bombs, dropped occasionally from a random front-line invader.
  s.bombTimer -= dt;
  if (s.bombTimer <= 0 && live.length) {
    s.bombTimer = 0.9 + rng();
    const shooter = live[Math.floor(rng() * live.length)];
    s.bombs.push({ x: shooter.x + INV_W / 2, y: shooter.y + INV_H });
  }
  for (const b of s.bombs) b.y += BOMB_SPEED * dt;
  for (let i = s.bombs.length - 1; i >= 0; i--) {
    const b = s.bombs[i];
    if (b.y > H) s.bombs.splice(i, 1);
    else if (
      b.x > s.shipX - SHIP_W / 2 &&
      b.x < s.shipX + SHIP_W / 2 &&
      b.y > SHIP_Y
    )
      s.over = true;
  }

  for (const sh of s.bullets) sh.y -= BULLET_SPEED * dt;
  for (let i = s.bullets.length - 1; i >= 0; i--) {
    const sh = s.bullets[i];
    if (sh.y < -6) {
      s.bullets.splice(i, 1);
      continue;
    }
    for (const inv of s.invaders)
      if (
        inv.alive &&
        sh.x > inv.x &&
        sh.x < inv.x + INV_W &&
        sh.y > inv.y &&
        sh.y < inv.y + INV_H
      ) {
        inv.alive = false;
        s.bullets.splice(i, 1);
        s.score++;
        break;
      }
  }
}
