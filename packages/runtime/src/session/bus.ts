import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT as EMPTY,
  reduceSnapshot,
  type SequencedFrame,
  StreamChannel,
  type WireFrame,
} from "@houston/runtime-client";

/**
 * Per-conversation event bus. This is the ONE place conversation isolation is
 * enforced: subscribers are partitioned by conversation id into disjoint sets, so
 * an event published for conversation A can only ever reach A's subscribers —
 * there is no global firehose for events to leak across conversations.
 *
 * It is also the conversation stream's sequencing authority: every published
 * event runs through a shared StreamChannel (@houston/runtime-client — the
 * same append → reduce → fan out → clear-on-terminal ordering the control
 * plane's turn relay uses), which stamps a per-conversation `seq` (strictly
 * monotonic from 1, for the process lifetime) and buffers the in-flight
 * turn's frames so a reconnecting subscriber can resume with `?after=<seq>` —
 * replayed frames + live frames, no gap, no duplicate. The buffer is cleared
 * right after a terminal frame fans out; the seq counter never resets.
 *
 * The channel also keeps the in-flight snapshot (running + partial + watermark
 * + the running turn's id) that catches a late or reconnecting subscriber up
 * via a `sync` frame, without waiting for the turn to finish.
 */

export { type ConversationSnapshot, reduceSnapshot };

type Subscriber = (frame: SequencedFrame) => void;

const subscribers = new Map<string, Set<Subscriber>>();
// One entry per conversation ever published to in this process — kept for the
// process lifetime because it owns the seq counter (a handful of small objects;
// conversations are bounded per runtime). Dropped only by evict().
const channels = new Map<string, StreamChannel>();

/** Publish an event to exactly one conversation's subscribers, stamping its seq. */
export function publish(id: string, event: WireFrame): void {
  let ch = channels.get(id);
  if (!ch) {
    ch = new StreamChannel();
    channels.set(id, ch);
  }
  ch.publish(event, (frame) => {
    const subs = subscribers.get(id);
    // Iterate a copy: a callback may (un)subscribe while we fan out.
    if (subs) for (const cb of [...subs]) cb(frame);
  });
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
  return channels.get(id)?.snapshot ?? EMPTY;
}

/** Whether any conversation in this runtime currently has an in-flight turn. */
export function anyTurnRunning(): boolean {
  for (const ch of channels.values()) {
    if (ch.snapshot.running) return true;
  }
  return false;
}

/** Whether THIS conversation currently has an in-flight turn. */
export function isTurnRunning(id: string): boolean {
  return channels.get(id)?.snapshot.running ?? false;
}

/**
 * The frames a resuming subscriber that saw everything up to `after` still
 * needs, in publish order. Null = the cursor cannot be served (older than the
 * replay window or ahead of the watermark) — send a `resync` sync instead.
 */
export function replayAfter(
  id: string,
  after: number,
): SequencedFrame[] | null {
  const ch = channels.get(id);
  if (!ch) return after === 0 ? [] : null;
  return ch.replayAfter(after);
}

/**
 * Drop a conversation's whole channel — seq counter, replay buffer, snapshot.
 * For DELETED conversations only: any outstanding cursor is unserviceable by
 * definition afterwards (a fresh channel restarts at seq 1 and a stale cursor
 * resyncs), which is exactly right for a transcript that no longer exists.
 * Live subscribers stay registered and simply see the next stream, if any.
 */
export function evict(id: string): void {
  channels.delete(id);
}

/** Live subscriber count for a conversation (tests / diagnostics). */
export function subscriberCount(id: string): number {
  return subscribers.get(id)?.size ?? 0;
}
