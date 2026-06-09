import type { WireEvent } from "@houston/runtime-client";

/**
 * Per-conversation event bus. This is the ONE place conversation isolation is
 * enforced: subscribers are partitioned by conversation id into disjoint sets, so
 * an event published for conversation A can only ever reach A's subscribers —
 * there is no global firehose for events to leak across conversations.
 *
 * It also keeps a small in-flight snapshot per conversation (is a turn running +
 * the assistant text so far) so a late or reconnecting subscriber can be caught
 * up to the current turn via a `sync` frame, without waiting for it to finish.
 */

export type ConversationSnapshot = { running: boolean; partial: string };

type Subscriber = (event: WireEvent) => void;

const subscribers = new Map<string, Set<Subscriber>>();
const snapshots = new Map<string, ConversationSnapshot>();

const EMPTY: ConversationSnapshot = { running: false, partial: "" };

/**
 * Fold a wire event into the running snapshot. Pure — exported for tests.
 * `partial` tracks only assistant *text* (enough to redraw the in-flight bubble);
 * tool/thinking frames keep the turn marked running without touching it.
 */
export function reduceSnapshot(
  prev: ConversationSnapshot,
  event: WireEvent,
): ConversationSnapshot {
  switch (event.type) {
    case "user":
      return { running: true, partial: "" };
    case "text":
      return { running: true, partial: prev.partial + event.data };
    case "thinking":
    case "tool_start":
    case "tool_end":
      return prev.running ? prev : { running: true, partial: prev.partial };
    case "done":
    case "error":
      return EMPTY;
    case "sync":
      return prev; // sync is a read-out, never published back into the bus
  }
}

/** Publish an event to exactly one conversation's subscribers. */
export function publish(id: string, event: WireEvent): void {
  const next = reduceSnapshot(snapshots.get(id) ?? EMPTY, event);
  if (next.running || next.partial) snapshots.set(id, next);
  else snapshots.delete(id);

  const subs = subscribers.get(id);
  if (!subs) return;
  // Iterate a copy: a callback may (un)subscribe while we fan out.
  for (const cb of [...subs]) cb(event);
}

/** Subscribe to one conversation's events. Returns an unsubscribe fn. */
export function subscribe(id: string, cb: Subscriber): () => void {
  let set = subscribers.get(id);
  if (!set) {
    set = new Set();
    subscribers.set(id, set);
  }
  set.add(cb);
  return () => {
    const s = subscribers.get(id);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) subscribers.delete(id);
  };
}

/** Current in-flight snapshot for a conversation (drives the `sync` frame on connect). */
export function snapshot(id: string): ConversationSnapshot {
  return snapshots.get(id) ?? EMPTY;
}

/** Live subscriber count for a conversation (tests / diagnostics). */
export function subscriberCount(id: string): number {
  return subscribers.get(id)?.size ?? 0;
}
