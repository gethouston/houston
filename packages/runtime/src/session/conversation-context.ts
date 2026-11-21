import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<string>();

export function runWithConversationId<T>(
  id: string | undefined,
  fn: () => T,
): T {
  if (!id) return fn();
  return store.run(id, fn);
}

export function currentConversationId(): string | undefined {
  return store.getStore();
}
