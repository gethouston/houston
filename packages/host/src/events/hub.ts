import type { HoustonEvent } from "@houston/protocol";
import type { UserId } from "../domain/types";
import { noteFilesChanged } from "../turn/files-missing";

export interface PubSub {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): () => void;
}

export interface EventHub {
  emit(userId: UserId, event: HoustonEvent): void;
  subscribe(userId: UserId, handler: (event: HoustonEvent) => void): () => void;
}

const channelFor = (userId: UserId) => `events:${userId}`;

export class BusEventHub implements EventHub {
  constructor(private readonly bus: PubSub) {}

  emit(userId: UserId, event: HoustonEvent): void {
    noteFilesChanged(event);
    void this.bus
      .publish(channelFor(userId), JSON.stringify(event))
      .catch((err) => {
        console.error(
          "[events] publish failed:",
          err instanceof Error ? err.message : err,
        );
      });
  }

  subscribe(
    userId: UserId,
    handler: (event: HoustonEvent) => void,
  ): () => void {
    return this.bus.subscribe(channelFor(userId), (message) => {
      try {
        handler(JSON.parse(message) as HoustonEvent);
      } catch (err) {
        console.error(
          "[events] dropped malformed frame:",
          err instanceof Error ? err.message : err,
        );
      }
    });
  }
}
