import {
  type SequencedFrame,
  StreamChannel,
  type WireFrame,
} from "@houston/runtime-client";
import type { SseSink } from "./sse";

export interface PendingTurn {
  turnId: string;
  remaining: string[];
}

export interface ChatChannel {
  channel: StreamChannel;
  subscribers: Set<(frame: SequencedFrame) => void>;
  sinks: Set<SseSink>;
  epoch: number;
  pending: PendingTurn | null;
}

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

export function publish(ch: ChatChannel, event: WireFrame): void {
  ch.channel.publish(event, (frame) => {
    for (const deliver of ch.subscribers) deliver(frame);
  });
}
