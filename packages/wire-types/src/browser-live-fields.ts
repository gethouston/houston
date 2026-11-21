import {
  BROWSER_HANDOFF_STATES,
  BROWSER_LIVE_HANDOFF,
  type BrowserHandoffState,
} from "./browser-live";

export type Body = Record<string, unknown>;

export function record(value: unknown, what: string): Body {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid ${what}`);
  return value as Body;
}

export function finite(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Invalid ${what}`);
  return value;
}

export function count(value: unknown, what: string): number {
  const n = finite(value, what);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${what}`);
  return n;
}

export function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Error(`Invalid ${what}`);
  return value;
}

export function unit(value: unknown, what: string): number {
  return Math.min(1, Math.max(0, finite(value, what)));
}

export function isState(value: unknown): value is BrowserHandoffState {
  return BROWSER_HANDOFF_STATES.includes(value as BrowserHandoffState);
}

export function handoffId(value: unknown, what: string): string {
  const id = text(value, what);
  if (!BROWSER_LIVE_HANDOFF.test(id)) throw new Error(`Invalid ${what}`);
  return id;
}
