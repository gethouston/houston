import assert from "node:assert/strict";
import test from "node:test";
import {
  COLS,
  createState,
  INV_H,
  INV_W,
  ROWS,
  reset,
  SHIP_W,
  SHIP_Y,
  shoot,
  steer,
  step,
  W,
} from "../src/components/onboarding/cloud-migration/space-invaders-model.ts";

const IDLE = { left: false, right: false, dt: 1 / 60 };

test("createState spawns a full swarm, ready to play", () => {
  const s = createState();
  assert.equal(s.invaders.length, ROWS * COLS);
  assert.ok(s.invaders.every((i) => i.alive));
  assert.equal(s.score, 0);
  assert.equal(s.over, false);
});

test("shoot adds a bullet, caps in-flight count, and is inert once over", () => {
  const s = createState();
  shoot(s);
  shoot(s);
  shoot(s);
  shoot(s); // fourth is dropped by the cap
  assert.equal(s.bullets.length, 3);
  const over = createState();
  over.over = true;
  shoot(over);
  assert.equal(over.bullets.length, 0);
});

test("a bullet overlapping an invader kills it and scores", () => {
  const s = createState();
  const target = s.invaders[0];
  // Park a bullet inside the invader's box so this step registers the hit.
  s.bullets.push({ x: target.x + INV_W / 2, y: target.y + INV_H / 2 });
  step(s, IDLE);
  assert.equal(target.alive, false);
  assert.equal(s.score, 1);
  assert.equal(s.bullets.length, 0);
});

test("clearing the swarm respawns it and keeps the score", () => {
  const s = createState();
  for (const inv of s.invaders) inv.alive = false;
  s.score = 40;
  step(s, IDLE);
  assert.equal(s.invaders.length, ROWS * COLS);
  assert.ok(s.invaders.every((i) => i.alive));
  assert.equal(s.score, 40);
});

test("an invader reaching the ship row ends the game", () => {
  const s = createState();
  for (const inv of s.invaders) inv.alive = false;
  s.invaders[0].alive = true;
  s.invaders[0].y = SHIP_Y - INV_H + 1; // its bottom crosses the ship row
  step(s, IDLE);
  assert.equal(s.over, true);
});

test("an enemy bomb striking the ship ends the game", () => {
  const s = createState();
  s.bombs.push({ x: s.shipX, y: SHIP_Y }); // right on the ship
  step(s, IDLE);
  assert.equal(s.over, true);
});

test("step is a no-op once the game is over", () => {
  const s = createState();
  s.over = true;
  const before = s.invaders[0].x;
  step(s, { left: true, right: false, dt: 1 });
  assert.equal(s.invaders[0].x, before);
  assert.equal(s.shipX, W / 2);
});

test("injected rng makes the bomb cadence deterministic", () => {
  const s = createState();
  // bombTimer starts at 0, so the first step is due to drop a bomb; rng()=0
  // resets the timer to 0.9 and selects the first live invader as the shooter.
  step(s, IDLE, () => 0);
  assert.equal(s.bombs.length, 1);
  assert.ok(Math.abs(s.bombTimer - 0.9) < 1e-9);
});

test("steer clamps the ship inside the field", () => {
  const s = createState();
  steer(s, -999);
  assert.equal(s.shipX, SHIP_W / 2);
  steer(s, 9999);
  assert.equal(s.shipX, W - SHIP_W / 2);
});

test("reset restores a fresh game after a loss", () => {
  const s = createState();
  s.over = true;
  s.score = 12;
  s.bullets.push({ x: 1, y: 1 });
  reset(s);
  assert.equal(s.over, false);
  assert.equal(s.score, 0);
  assert.equal(s.bullets.length, 0);
  assert.equal(s.invaders.length, ROWS * COLS);
});
