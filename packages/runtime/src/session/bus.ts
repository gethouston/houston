import {
  EMPTY_SNAPSHOT as EMPTY,
  reduceSnapshot,
  type ConversationSnapshot,
  type WireEvent,
} from "@houston/runtime-client";

/**
 * Per-conversation event bus. This is the ONE place conversation isolation is
 * enforced: subscribers are partitioned by conversation id into disjoint sets, so
 * an event published for conversation A can only ever reach A's subscribers —
 * there is no global firehose for events to leak across conversations.
 *
 * It also keeps a small in-flight snapshot per conversation (is a turn running +
 * the assistant text so far) so a late or reconnecting subscriber can be caught
 * up to the current turn via a `sync` frame, without waiting for it to finish.
 * The snapshot reducer lives in @houston/runtime-client (shared with the
 * control plane's turn relay, which must mirror these semantics exactly).
 */

export { reduceSnapshot, type ConversationSnapshot };

type Subscriber = (event: WireEvent) => void;

const subscribers = new Map<string, Set<Subscriber>>();
const snapshots = new Map<string, ConversationSnapshot>();

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
