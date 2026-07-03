/**
 * The fake host's per-conversation channel core: the channel registry and the
 * shared publish path (append → reduce → fan out → clear-on-terminal), built on
 * the real `StreamChannel` from `@houston/runtime-client` so the mock cannot
 * drift from the wire contract.
 *
 * The turn producer (chat-turn.ts) and the SSE wiring (chat-stream.ts) both
 * build on these primitives.
 */

import {
  type SequencedFrame,
  StreamChannel,
  type WireFrame,
} from "@houston/runtime-client";
import type { SseSink } from "./sse";

export interface PendingTurn {
  turnId: string;
  /** Reply deltas the producer loop has not published yet. */
  remaining: string[];
}

export interface ChatChannel {
  /** Shared publish core: seq authority + replay buffer + snapshot. */
  channel: StreamChannel;
  /** Live per-connection delivery callbacks (serveResumableStream). */
  subscribers: Set<(frame: SequencedFrame) => void>;
  /** Open SSE connections, so test controls can sever them. */
  sinks: Set<SseSink>;
  /** Bumped on cancel/kill/boundary/reset so an in-flight producer stops. */
  epoch: number;
  /** The running turn, while its producer loop is live. */
  pending: PendingTurn | null;
}

/** Chat channels, keyed `${agentId}:${conversationId}`. */
export const channels = new Map<string, ChatChannel>();

export function chatKey(agentId: string, cid: string): string {
  return `${agentId}:${cid}`;
}

export function channel(key: string): ChatChannel {
  let ch = channels.get(key);
  if (!ch) {
    ch = {
      channel: new StreamChannel(),
      subscribers: new Set(),
      sinks: new Set(),
      epoch: 0,
      pending: null,
    };
    channels.set(key, ch);
  }
  return ch;
}

/** Publish one event through the shared channel, fanning out to live streams. */
export function publish(ch: ChatChannel, event: WireFrame): void {
  ch.channel.publish(event, (frame) => {
    for (const deliver of ch.subscribers) deliver(frame);
  });
}
