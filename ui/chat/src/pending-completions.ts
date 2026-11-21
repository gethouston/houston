import { useSyncExternalStore } from "react";

const pending = new Set<string | symbol>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isCompletionPending(key: string | symbol): boolean {
  return pending.has(key);
}

export function markCompletionPending(key: string | symbol): void {
  pending.add(key);
  notify();
}

export function settleCompletion(key: string | symbol): void {
  if (pending.delete(key)) notify();
}

export function useCompletionPending(key: string | symbol): boolean {
  const read = () => pending.has(key);
  return useSyncExternalStore(subscribe, read, read);
}
