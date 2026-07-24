/**
 * Pure rules for the {@link SpaceInvaders} canvas easter egg — everything about
 * the game that can be reasoned about without a canvas: spawning, movement,
 * collisions, and a deterministic `step`. Geometry constants and state shapes
 * live in `space-invaders-defs.ts`; the React/canvas shell
 * (`space-invaders.tsx`) owns only rendering and input wiring, so this file is
 * unit-testable under `node --test` (see `app/tests/space-invaders-model.ts`).
 */

import {
  BOMB_SPEED,
  BULLET_SPEED,
  COLS,
  EXPLOSION_TTL,
  GAP_X,
  GAP_Y,
  type GameState,
  H,
  INV_H,
  INV_W,
  type Invader,
  MAX_BULLETS,
  ROWS,
  SHIP_SPEED,
  SHIP_W,
  SHIP_Y,
  type StepInput,
  W,
} from "./space-invaders-defs.ts";

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
        row: r,
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
    explosions: [],
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
  for (const explosion of s.explosions) explosion.age += dt;
  s.explosions = s.explosions.filter(
    (explosion) => explosion.age <= EXPLOSION_TTL,
  );
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
  for (const inv of live) if (inv.y + INV_H >= SHIP_Y) endGame(s);

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
      endGame(s);
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
        s.explosions.push({
          x: inv.x + INV_W / 2,
          y: inv.y + INV_H / 2,
          age: 0,
        });
        break;
      }
  }
}

function endGame(s: GameState): void {
  if (s.over) return;
  s.over = true;
  s.explosions.push({ x: s.shipX, y: SHIP_Y, age: 0 });
}
