import type { SequencedFrame } from "./replay";
import type { ConversationSnapshot } from "./snapshot";
import type { WireFrame } from "./types";

export interface ResumableStreamSource {
  subscribe(deliver: (frame: SequencedFrame) => void): () => void;
  snapshot(): ConversationSnapshot | Promise<ConversationSnapshot>;
  replayAfter(
    after: number,
  ): SequencedFrame[] | null | Promise<SequencedFrame[] | null>;
}

export async function serveResumableStream(
  source: ResumableStreamSource,
  cursor: number | undefined,
  send: (frame: WireFrame) => void,
): Promise<() => void> {
  let buffered: SequencedFrame[] | null = [];
  const unsubscribe = source.subscribe((frame) => {
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
  for (const frame of buffered) {
    if (frame.seq <= watermark) continue;
    watermark = frame.seq;
    send(frame);
  }
  buffered = null;
  return unsubscribe;
}
