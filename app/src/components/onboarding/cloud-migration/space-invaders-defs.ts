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
export const SHIP_SPEED = 150;
export const BULLET_SPEED = 260;
export const BOMB_SPEED = 90;
export const EXPLOSION_TTL = 0.35;
export const MAX_BULLETS = 3;

export interface Invader {
  x: number;
  y: number;
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
  age: number;
}
export interface GameState {
  invaders: Invader[];
  dir: number;
  shipX: number;
  bullets: Shot[];
  bombs: Shot[];
  explosions: Explosion[];
  score: number;
  over: boolean;
  bombTimer: number;
}
export interface StepInput {
  left: boolean;
  right: boolean;
  dt: number;
}
