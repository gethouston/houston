import { AsyncLocalStorage } from "node:async_hooks";

export interface TurnModel {
  provider: string;
  model: string;
}

const store = new AsyncLocalStorage<TurnModel>();

export function runWithTurnModel<T>(
  turnModel: TurnModel | undefined,
  fn: () => T,
): T {
  if (!turnModel) return fn();
  return store.run(turnModel, fn);
}

export function currentTurnModel(): TurnModel | undefined {
  return store.getStore();
}
