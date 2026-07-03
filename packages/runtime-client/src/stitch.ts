import type { SequencedFrame } from "./replay";
import type { ConversationSnapshot } from "./snapshot";
import type { WireFrame } from "./types";

/**
 * The server-side resume stitch — THE one implementation of the connect
 * contract behind every conversation events route (runtime + host relay):
 *
 *   1. subscribe FIRST, buffering live frames that arrive while the (possibly
 *      async) replay/snapshot reads run;
 *   2. decide: a serviceable cursor replays the missed frames with no `sync`;
 *      no cursor gets a fresh `sync`; an unserviceable cursor gets a `sync`
 *      with `resync: true`;
 *   3. flush the buffered live frames deduped against the seq watermark the
 *      replay/sync established — no gap, no duplicate, even though the reads
 *      were async;
 *   4. then hand the connection over to plain live delivery IN ARRIVAL ORDER.
 *
 * The watermark dedupe exists ONLY to stitch step 2 against step 3's
 * concurrently-buffered frames. It must never outlive the flush: the fan-out
 * authority's arrival order is authoritative, and a stream whose seq counter
 * regressed (snapshot TTL expiry, an evicted conversation) would otherwise
 * starve a connected subscriber forever.
 *
 * Transport-agnostic and browser-safe: callbacks in, frames out — no sockets.
 */
export interface ResumableStreamSource {
  /** Register a live-frame listener; returns unsubscribe. Synchronous. */
  subscribe(deliver: (frame: SequencedFrame) => void): () => void;
  /** The stream's current snapshot (`seq` = watermark). */
  snapshot(): ConversationSnapshot | Promise<ConversationSnapshot>;
  /** Missed frames for a cursor, or null when it cannot be served. */
  replayAfter(
    after: number,
  ): SequencedFrame[] | null | Promise<SequencedFrame[] | null>;
}

/**
 * Serve one conversation-events connection against `source`: replay/sync per
 * `cursor` (undefined = fresh connect), then live frames, all via `send`.
 * Returns the unsubscribe for the live subscription — the caller invokes it
 * when the transport closes (and must invoke it even if the transport closed
 * while this was still awaiting the source reads).
 */
export async function serveResumableStream(
  source: ResumableStreamSource,
  cursor: number | undefined,
  send: (frame: WireFrame) => void,
): Promise<() => void> {
  let buffered: SequencedFrame[] | null = [];
  const unsubscribe = source.subscribe((frame) => {
    // Stitch window only: after the initial flush, live frames flow through
    // in arrival order with no seq gate (see module doc).
    buffered ? buffered.push(frame) : send(frame);
  });

  let watermark = 0;
  const replay = cursor === undefined ? null : await source.replayAfter(cursor);
  if (cursor !== undefined && replay !== null) {
    watermark = cursor;
    for (const frame of replay) {
      watermark = frame.seq;
      send(frame);
    }
  } else {
    const snap = await source.snapshot();
    watermark = snap.seq;
    send({
      type: "sync",
      data: cursor === undefined ? snap : { ...snap, resync: true },
      seq: snap.seq,
    });
  }
  // Flush the frames buffered during the async reads, deduped against what
  // the replay/sync already covered. Synchronous, so nothing interleaves.
  for (const frame of buffered) {
    if (frame.seq <= watermark) continue;
    watermark = frame.seq;
    send(frame);
  }
  buffered = null;
  return unsubscribe;
}
