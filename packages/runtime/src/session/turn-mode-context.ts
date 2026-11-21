import { AsyncLocalStorage } from "node:async_hooks";
import type { TurnMode } from "@houston/protocol";

export interface TurnModeRef {
  current: TurnMode;
}

const store = new AsyncLocalStorage<TurnModeRef>();

export function runWithTurnMode<T>(ref: TurnModeRef, fn: () => T): T {
  return store.run(ref, fn);
}

export function currentTurnMode(): TurnMode | undefined {
  return store.getStore()?.current;
}
