import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const chains = new Map<string, Promise<void>>();

function lockKey(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

export function withWorkdirLock<T>(
  dir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = lockKey(dir);
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, settled);
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}
