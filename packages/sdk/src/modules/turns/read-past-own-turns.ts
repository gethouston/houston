import { EngineError } from "@houston/runtime-client";
import type { StreamRegistry } from "./stream-registry";

export interface MarkedRead<T> {
  value: T;
  mark: number | null;
}

export async function readPastOwnTurns<T>(
  registry: StreamRegistry,
  key: string,
  read: () => Promise<T>,
): Promise<MarkedRead<T>> {
  const disposals = registry.disposals;
  for (;;) {
    const mark = registry.turnsStarted(key);
    const overtakenAtStart = registry.ownsUnacceptedSend(key);
    const overtaken = () =>
      overtakenAtStart || registry.turnsStarted(key) !== mark;
    let value: T;
    try {
      value = await read();
    } catch (e) {
      if (!isNotFound(e) || !overtaken()) throw e;
      await registry.ownTurnLeft(key);
      if (registry.disposals !== disposals) throw e;
      continue;
    }
    if (registry.disposals !== disposals) return { value, mark: null };
    if (!overtaken()) return { value, mark };
    await registry.ownTurnLeft(key);
    if (registry.disposals !== disposals) return { value, mark: null };
  }
}

const isNotFound = (e: unknown): boolean =>
  e instanceof EngineError && e.status === 404;
