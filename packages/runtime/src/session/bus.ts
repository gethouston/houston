import { AsyncLocalStorage } from "node:async_hooks";
import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT as EMPTY,
  reduceSnapshot,
  type SequencedFrame,
  StreamChannel,
  type WireFrame,
} from "@houston/runtime-client";

export { type ConversationSnapshot, reduceSnapshot };

type Subscriber = (frame: SequencedFrame) => void;

const subscribers = new Map<string, Set<Subscriber>>();
const channels = new Map<string, StreamChannel>();
const SERVER_SCOPE = "server";
const scopeStore = new AsyncLocalStorage<string>();

const keyFor = (id: string, scope = scopeStore.getStore() ?? SERVER_SCOPE) =>
  `${scope}:${id}`;

export function runWithConversationScope<T>(scope: string, fn: () => T): T {
  return scopeStore.run(scope, fn);
}

export function publish(id: string, event: WireFrame): void {
  const key = keyFor(id);
  let ch = channels.get(key);
  if (!ch) {
    ch = new StreamChannel();
    channels.set(key, ch);
  }
  ch.publish(event, (frame) => {
    const subs = subscribers.get(key);
    if (subs) for (const cb of [...subs]) cb(frame);
  });
}

export function subscribe(id: string, cb: Subscriber): () => void {
  const key = keyFor(id);
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(cb);
  return () => {
    const s = subscribers.get(key);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) subscribers.delete(key);
  };
}

export function snapshot(id: string): ConversationSnapshot {
  return channels.get(keyFor(id))?.snapshot ?? EMPTY;
}

export function replayAfter(
  id: string,
  after: number,
): SequencedFrame[] | null {
  const ch = channels.get(keyFor(id));
  if (!ch) return after === 0 ? [] : null;
  return ch.replayAfter(after);
}

export function evict(id: string): void {
  channels.delete(keyFor(id));
}

export function releaseConversation(scope: string, id: string): void {
  const key = keyFor(id, scope);
  channels.delete(key);
  subscribers.delete(key);
}

export function subscriberCount(id: string): number {
  return subscribers.get(keyFor(id))?.size ?? 0;
}
