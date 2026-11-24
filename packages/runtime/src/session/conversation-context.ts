import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";

const store = new AsyncLocalStorage<{ id: string; dataDir?: string }>();

export function runWithConversationId<T>(
  id: string | undefined,
  fn: () => T,
  dataDir?: string,
): T {
  if (!id) return fn();
  return store.run(dataDir ? { id, dataDir } : { id }, fn);
}

export function currentConversationId(): string | undefined {
  return store.getStore()?.id;
}

export function currentConversationSessionDir(): string | undefined {
  const current = store.getStore();
  return current?.dataDir
    ? join(current.dataDir, "sessions", current.id)
    : undefined;
}
